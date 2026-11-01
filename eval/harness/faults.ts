import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFile,writeFile,mkdir,appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPool,transaction } from '../../packages/db/client.js';
import { Handoff } from '../../packages/domain/execution.js';
import { fixtures } from '../../packages/domain/store.js';
import { snapshotVersions,reference } from '../../packages/domain/evidence.js';
import { audit } from './audit.js';
import { provenance,saveReport } from './provenance.js';
const plan=JSON.parse(await readFile('eval/plans/registered.json','utf8')),truth=JSON.parse(await readFile('eval/truth/expected.json','utf8'));
const pool=createPool(),reader=createPool(),app=new Handoff(pool,{testMode:true,sessionRate:10000}),other=new Handoff(reader,{testMode:true});
const key=()=>randomUUID(),run_id='faults-'+Date.now(),started_at=new Date().toISOString(),rows:any[]=[];
const environment={kind:new URL(process.env.DATABASE_URL!).hostname==='127.0.0.1'?'isolated-loopback-postgres':'remote-direct-postgres',database:(await reader.query('SELECT version() AS version,current_database() AS database')).rows[0],schema:'handoff'};
const configuration={faults:plan.faults,version:2,audit_version:2,parallelism:1,environment},prov=await provenance('scripted',configuration);
await mkdir('reports/environments',{recursive:true});await writeFile(`reports/environments/${run_id}.json`,JSON.stringify(configuration,null,2)+'\n');
await mkdir('reports/faults',{recursive:true});
async function processFault(fault:string,cap:string,id:string,input:any,requestKey:string,row:any){
 const child=fork('build/eval/harness/fault-worker.js',[fault],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 const messages:any[]=[];let resolveReady:(v:any)=>void=()=>{},resolveBarrier:(v:any)=>void=()=>{};
 const ready=new Promise<any>(r=>resolveReady=r),barrier=new Promise<any>(r=>resolveBarrier=r);
 child.on('message',(m:any)=>{messages.push(m);if(m.type==='ready')resolveReady(m);if(m.type==='barrier')resolveBarrier(m);});
 const deadline=(p:Promise<any>)=>Promise.race([p,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('injector_not_exercised')),30000);t.unref();})]);
 let request:Promise<any>|undefined;
 try{
  const server=await deadline(ready);row.worker_pid=server.pid;
  request=fetch(`http://127.0.0.1:${server.port}/cases/${id}/execute`,{method:'POST',headers:{authorization:'Bearer '+cap,'content-type':'application/json','idempotency-key':requestKey},body:JSON.stringify(input),signal:AbortSignal.timeout(35000)}).then(async r=>({received:true,status:r.status,body:await r.json()})).catch(e=>({received:false,error:e.name}));
  const reached=await deadline(barrier);row.injector={...reached,observed_at:new Date().toISOString(),schema:'handoff'};
  // This journal is written by the parent before termination, outside the killed worker.
  await appendFile(`reports/faults/${run_id}-injectors.jsonl`,JSON.stringify({fixture_id:row.fixture_id,fault,...row.injector})+'\n');
  const exited=once(child,'exit');child.kill('SIGKILL');row.exit=await deadline(exited);
  row.transport=await request;assert.equal(row.transport.received,false,'response_must_be_lost');
  row.injector_exercised=true;
 }finally{if(child.exitCode===null&&!child.killed)child.kill('SIGKILL');}
}
try{
 for(const entry of plan.cases.filter((x:any)=>x.split==='held-out')){
  const f=fixtures.find(f=>f.fixture_id===entry.fixture_id)!,expected=truth.find((t:any)=>t.fixture_id===f.fixture_id);
  for(const fault of plan.faults){
   const row:any={fixture_id:f.fixture_id,fault,applicable:!(expected.terminal==='blocked'&&['stale_order','expired_review','crash_before_commit','response_lost','concurrent_execute'].includes(fault)),injector_exercised:false,passed:false};
   if(!row.applicable){row.reason='Identity refusal has no approval or execution boundary.';rows.push(row);continue;}
   let sid='';
   try{
    const s=await app.createSession();sid=s.session_id;const input={fixture_id:f.fixture_id,source_event_id:key()},intakeKey=key();
    const first=await app.intake(s.capability,input,intakeKey),id=first.case_id;
    if(fault==='duplicate_intake'){
     assert.deepEqual(await app.intake(s.capability,input,intakeKey),first);
     const calls=await Promise.allSettled([app.intake(s.capability,input,key()),other.intake(s.capability,input,key())]);
     assert.equal(calls.filter(c=>c.status==='fulfilled'&&(c.value as any).case_id===id).length,2);
     assert.equal((await reader.query('SELECT count(*)::int n FROM handoff.cases WHERE session_id=$1',[sid])).rows[0].n,1);row.injector_exercised=true;
    }
    await app.step(s.capability,id,1,key());
    if(fault==='invalid_proposal'){
     const w=await transaction(reader,async db=>app.world(db,await app.case(db,sid,id)));
     const result=await app.propose(s.capability,id,{action_code:'propose_refund',evidence_refs:[reference(w.policy,w.policy.clauses[0]!)],fact_versions:snapshotVersions(w.fixture,w.policy,w.policyRevision),rationale:'Deliberate invalid proposal for validator calibration.',suggested_amount_cents:99999999},2,key());
     assert.equal(result.valid,false);assert.equal(result.state,'review_needed');row.injector_exercised=true;
     await app.step(s.capability,id,result.revision,key(),true);
    }
    let view=await app.view(s.capability,id);
    if(fault==='read_timeout'){
     let attempts=0;const injected=new Handoff(pool,{testMode:true,readFault:async()=>{attempts++;if(attempts===1)throw new Error('read_timeout');}});
     await injected.step(s.capability,id,view.revision,key());row.read_attempts=attempts;row.injector_exercised=attempts===2;
    }else await app.step(s.capability,id,view.revision,key());
    view=await app.view(s.capability,id);
    if(view.state==='awaiting_review'){
     const reviewed=await app.review(s.capability,id,{proposal_digest:view.proposal.content_digest,expected_revision:view.revision,decision:'approve'},key(),'scripted_test');
     const executeInput={proposal_digest:view.proposal.content_digest,expected_revision:reviewed.revision},operationKey=key();
     if(fault==='stale_order'||fault==='expired_review'){
      if(fault==='stale_order')await reader.query('UPDATE handoff.orders SET revision=revision+1 WHERE session_id=$1',[sid]);
      else await reader.query("UPDATE handoff.reviews SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[sid]);
      const refused=await app.execute(s.capability,id,executeInput,operationKey);
      assert.equal(refused.code,fault==='stale_order'?'stale_approval':'review_expired');row.injector_exercised=true;
      assert.equal((await reader.query('SELECT count(*)::int n FROM handoff.effects WHERE session_id=$1',[sid])).rows[0].n,0);
      row.audit=await audit(reader,sid,id,{...expected,effect_count:0,terminal:fault==='stale_order'?'review_needed':'expired'});
     }else{
      if(fault==='crash_before_commit'||fault==='response_lost'){
       await processFault(fault,s.capability,id,executeInput,operationKey,row);
       const before=(await reader.query('SELECT count(*)::int n FROM handoff.request_receipts WHERE session_id=$1 AND idempotency_key=$2',[sid,operationKey])).rows[0].n;
       assert.equal(before,fault==='crash_before_commit'?0:1);row.receipts_before_retry=before;
       const delta=(await reader.query('SELECT SUM(refunded_cents-initial_refunded_cents)::int delta FROM handoff.captures WHERE session_id=$1',[sid])).rows[0].delta;
       assert.equal(delta,fault==='crash_before_commit'?0:expected.amount_cents);row.balance_delta_before_retry=delta;
      }
      if(fault==='concurrent_execute'){
       const attempts=await Promise.allSettled([app.execute(s.capability,id,executeInput,operationKey),other.execute(s.capability,id,executeInput,key())]);
       const good=attempts.filter(x=>x.status==='fulfilled').map(x=>(x as PromiseFulfilledResult<any>).value);assert.ok(good.length);if(good.length===2)assert.deepEqual(good[0],good[1]);row.client_outcomes=attempts.map(x=>x.status);row.injector_exercised=true;
      }
      const result=await app.execute(s.capability,id,executeInput,operationKey);
      assert.deepEqual(await other.execute(s.capability,id,executeInput,key()),result);
      if(fault==='response_lost'){const recovered=await other.recover(s.capability,operationKey);assert.deepEqual(recovered.receipts[0].response_body,result);}
      row.audit=await audit(reader,sid,id,expected);
     }
    }else row.audit=await audit(reader,sid,id,expected);
    assert.equal(row.injector_exercised,true,'injector_not_exercised');assert.equal(row.audit.passed,true,JSON.stringify(row.audit.errors));row.passed=true;
   }catch(error){row.error=(error as Error).message;}
   finally{if(sid)await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=$1',[sid]);rows.push(row);await appendFile(`reports/faults/${run_id}-progress.jsonl`,JSON.stringify(row)+'\n');}
  }
  console.log(JSON.stringify({attempted:rows.length,passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>x.applicable&&!x.passed).length}));
 }
 const applicable=rows.filter(r=>r.applicable),exercised=applicable.filter(r=>r.injector_exercised);
 const metrics=[{metric_id:'injector_coverage',mode:'scripted',split:'held-out',numerator:exercised.length,denominator:applicable.length,unit:'injections',source:'parent barrier journal and checked database mutations',input_digest:prov.dataset_digest},{metric_id:'recovery_correctness',mode:'scripted',split:'held-out',numerator:exercised.filter(r=>r.passed).length,denominator:exercised.length,unit:'injections',source:'independent post-fault SQL ledger audit',input_digest:prov.dataset_digest}];
 await saveReport({...prov,run_id,started_at,finished_at:new Date().toISOString(),attempted_case_ids:plan.cases.filter((x:any)=>x.split==='held-out').map((x:any)=>x.fixture_id),metrics,evidence_paths:[`reports/faults/${run_id}-injectors.jsonl`,`reports/runs/${run_id}-cases.json`,`reports/environments/${run_id}.json`],status:applicable.every(r=>r.passed)?'passed':'failed'},rows);
 console.log(JSON.stringify({run_id,total:rows.length,applicable:applicable.length,exercised:exercised.length,passed:exercised.filter(r=>r.passed).length}));
 if(applicable.some(r=>!r.passed))process.exitCode=1;
}finally{await pool.end();await reader.end();}
