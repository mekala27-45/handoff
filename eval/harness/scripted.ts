import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createPool,migrate } from '../../packages/db/client.js';
import { Handoff } from '../../packages/domain/execution.js';
import { fixtures } from '../../packages/domain/store.js';
import { audit } from './audit.js';
import { provenance,saveReport } from './provenance.js';
import type { Truth } from '../truth/oracle.js';
const plan=JSON.parse(await readFile('eval/plans/registered.json','utf8')),truth:Truth[]=JSON.parse(await readFile('eval/truth/expected.json','utf8'));
const pool=createPool(),reader=createPool(),app=new Handoff(pool,{testMode:true,sessionRate:10000});await migrate(pool);
const environment={kind:new URL(process.env.DATABASE_URL!).hostname==='127.0.0.1'?'isolated-loopback-postgres':'remote-direct-postgres',database:(await reader.query('SELECT version() AS version,current_database() AS database')).rows[0],schema:'handoff'};
const started_at=new Date().toISOString(),run_id='scripted-'+Date.now(),config={controller:'scripted-v1',plan_digest:plan.model_subset_digest,audit_version:2,environment},prov=await provenance('scripted',config);
await mkdir('reports/environments',{recursive:true});await writeFile(`reports/environments/${run_id}.json`,JSON.stringify(config,null,2)+'\n');
const rows:any[]=[];
try{
 for(const f of fixtures){
  const begin=performance.now(),session=await app.createSession(),expected=truth.find(x=>x.fixture_id===f.fixture_id)!,split=plan.cases.find((x:any)=>x.fixture_id===f.fixture_id).split;
  try{
   const {case_id}=await app.intake(session.capability,{fixture_id:f.fixture_id,source_event_id:randomUUID()},randomUUID());
   await app.step(session.capability,case_id,1,randomUUID());await app.step(session.capability,case_id,2,randomUUID());
   let view=await app.view(session.capability,case_id);
   const proposal=(await reader.query('SELECT action_code,amount_cents,evidence_refs,validation_result FROM handoff.proposals WHERE session_id=$1 AND case_id=$2',[session.session_id,case_id])).rows[0];
   const correct=proposal?.action_code===expected.action&&proposal.amount_cents===expected.amount_cents&&proposal.evidence_refs.some((r:any)=>r.clause_id===expected.clause)&&proposal.validation_result;
   if(view.state==='awaiting_review'){await app.review(session.capability,case_id,{proposal_digest:view.proposal.content_digest,expected_revision:view.revision,decision:'approve'},randomUUID(),'scripted_test');view=await app.view(session.capability,case_id);await app.execute(session.capability,case_id,{proposal_digest:view.proposal.content_digest,expected_revision:view.revision},randomUUID());}
   const checked=await audit(reader,session.session_id,case_id,expected);
   rows.push({fixture_id:f.fixture_id,split,action:proposal?.action_code??null,expected_action:expected.action,proposal_correct:!!correct,elapsed_ms:performance.now()-begin,audit:checked});
  }catch(error){rows.push({fixture_id:f.fixture_id,split,proposal_correct:false,error:(error as Error).message,elapsed_ms:performance.now()-begin});}
  finally{await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=$1',[session.session_id]);}
  if(rows.length%10===0)console.log(JSON.stringify({attempted:rows.length,correct:rows.filter(r=>r.proposal_correct).length}));
 }
 const metrics=['development','held-out'].flatMap(split=>{const a=rows.filter(r=>r.split===split);return [{metric_id:'proposal_correctness',mode:'scripted',split,numerator:a.filter(r=>r.proposal_correct).length,denominator:a.length,unit:'cases',source:'eval/truth/expected.json',input_digest:prov.dataset_digest},{metric_id:'safe_terminal_state',mode:'scripted',split,numerator:a.filter(r=>r.audit?.passed).length,denominator:a.length,unit:'cases',source:'eval/harness/audit.ts: independent SQL ledger',input_digest:prov.dataset_digest}];});
 await saveReport({...prov,run_id,started_at,finished_at:new Date().toISOString(),attempted_case_ids:fixtures.map(f=>f.fixture_id),metrics,evidence_paths:[`reports/runs/${run_id}-cases.json`,`reports/environments/${run_id}.json`],status:rows.every(r=>r.proposal_correct&&r.audit?.passed)?'passed':'failed'},rows);
 console.log(JSON.stringify({run_id,status:rows.every(r=>r.proposal_correct&&r.audit?.passed)?'passed':'failed'}));
 if(rows.some(r=>!r.proposal_correct||!r.audit?.passed))process.exitCode=1;
}finally{await pool.end();await reader.end();}
