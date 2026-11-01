import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createPool } from '../../packages/db/client.js';
import { Handoff } from '../../packages/domain/execution.js';
import { fixtures } from '../../packages/domain/store.js';
import { provenance,saveReport } from './provenance.js';
import { modelConfiguration,frozenConfiguration } from './model-experiment-config.js';
const development=process.argv.includes('--development'),plan=JSON.parse(await readFile('eval/plans/registered.json','utf8'));
const experiment=JSON.parse(await readFile('eval/plans/model-experiment-v3.json','utf8'));
const ids:string[]=development?experiment.development_case_ids:experiment.held_out_case_ids;
if(!ids.length)throw new Error('empty_experiment_scope');
if(development&&ids.some(id=>!plan.cases.some((x:any)=>x.fixture_id===id&&x.split==='development')))throw new Error('development_scope_leak');
const truth=JSON.parse(await readFile('eval/truth/expected.json','utf8'));
const pool=createPool(),reader=createPool(),app=new Handoff(pool,{testMode:true,sessionRate:10000});
const config=development?await modelConfiguration():await frozenConfiguration();
const prov=await provenance('local-model',config),run_id=(development?'model-development-v3-':'model-heldout-v3-')+Date.now(),started_at=new Date().toISOString(),rows:any[]=[];
await mkdir('.local/model-traces',{recursive:true});await mkdir('reports/model-traces',{recursive:true});
try{
 for(const fixtureId of ids){const f=fixtures.find(f=>f.fixture_id===fixtureId)!,session=await app.createSession(),caseRun=run_id+'-'+fixtureId,begin=performance.now();
  let row:any={fixture_id:fixtureId,mode:'local-model',proposal_correct:false,terminal_record:false};
  try{
   const hardware=await fetch('http://127.0.0.1:11435/api/ps').then(r=>r.json()) as any;
   const loaded=hardware.models?.find((m:any)=>m.name==='qwen3:0.6b');
   row.hardware=loaded?{name:loaded.name,digest:loaded.digest,size:loaded.size,size_vram:loaded.size_vram,context_length:loaded.context_length}:null;
   if(!loaded||loaded.size_vram!==0||loaded.context_length!==8192)throw new Error('cpu_model_preflight_failed');
   const c=await app.intake(session.capability,{fixture_id:fixtureId,source_event_id:randomUUID()},randomUUID(),'local-model');await app.step(session.capability,c.case_id,1,randomUUID());
   await writeFile('.local/model-scope.json',JSON.stringify({run_id:caseRun,case_id:c.case_id,order_id:f.order.order_id,capability:session.capability,started_at:Date.now()}));
   const response=await fetch('http://127.0.0.1:2088/evaluation/run/'+caseRun,{method:'POST',headers:{'content-type':'application/json','x-evaluation-key':process.env.HANDOFF_EVAL_TOKEN??''},body:JSON.stringify({message:`Review current case ${c.case_id}. Order ID: ${f.order.order_id}. Ticket data: ${f.ticket}. Read the order facts, retrieve policy, then submit one resolution. /no_think`}),signal:AbortSignal.timeout(125000)});
   const result=await response.json();row.runtime_result=result;row.http_status=response.status;
   const p=(await reader.query('SELECT action_code,amount_cents,evidence_refs,validation_result,validation_reason_codes FROM handoff.proposals WHERE session_id=$1 AND case_id=$2 ORDER BY created_at DESC LIMIT 1',[session.session_id,c.case_id])).rows[0];
   const t=truth.find((x:any)=>x.fixture_id===fixtureId);row.action=p?.action_code??null;row.expected_action=t.action;row.validation=p?.validation_result??false;row.validation_reasons=p?.validation_reason_codes??[];
   row.evidence_valid=!!p&&p.validation_result&&p.evidence_refs.some((r:any)=>r.clause_id===t.clause);
   row.unsafe_proposal=!!p&&(p.action_code!==t.action||p.amount_cents!==t.amount_cents);
   row.unclassified=!p;
   row.proposal_correct=!!p&&p.action_code===t.action&&p.amount_cents===t.amount_cents&&row.evidence_valid;
   row.terminal_record=true;
  }catch(error){row.error=(error as Error).message;row.terminal_record=true;}
  finally{
   const traceText=await readFile(`.local/model-traces/${caseRun}.jsonl`,'utf8').catch(()=>'');
   const trace=traceText.trim()?traceText.trim().split('\n').map(s=>JSON.parse(s)):[];
   row.tool_requests=trace.filter(t=>t.type==='model_tool_request').length;row.model_calls=trace.filter(t=>t.type==='effective_tool_inventory').length;
   row.framework_tool_requests=trace.filter(t=>t.type==='eve_call_requested').length;row.usage=trace.filter(t=>t.type==='usage_recorded').map(t=>t.data);
   row.elapsed_ms=performance.now()-begin;row.trace=`reports/model-traces/${caseRun}.json`;
   await writeFile(row.trace,JSON.stringify({run_id:caseRun,...prov,trace},null,2)+'\n');rows.push(row);
   await writeFile(`reports/model-traces/${run_id}-progress.json`,JSON.stringify(rows,null,2)+'\n');
   await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=$1',[session.session_id]);
   console.log(JSON.stringify({fixture_id:fixtureId,correct:row.proposal_correct,model_calls:row.model_calls,tool_requests:row.tool_requests,error:row.error??null}));
  }
 }
 const metrics=[{metric_id:'proposal_correctness',mode:'local-model',split:development?'development':'held-out',numerator:rows.filter(r=>r.proposal_correct).length,denominator:ids.length,unit:'cases',source:'eval/truth/expected.json',input_digest:prov.dataset_digest},{metric_id:'actual_tool_execution',mode:'local-model',split:development?'development':'held-out',numerator:rows.filter(r=>r.tool_requests>0&&r.model_calls>0).length,denominator:ids.length,unit:'cases',source:'eve channel events and scoped tool handlers',input_digest:prov.dataset_digest}];
 for(const [metric_id,field] of [['valid_required_evidence','evidence_valid'],['unsafe_proposed_action','unsafe_proposal'],['unclassified_missing_output','unclassified']])metrics.push({metric_id:metric_id!,mode:'local-model',split:development?'development':'held-out',numerator:rows.filter(r=>r[field!]).length,denominator:ids.length,unit:'cases',source:'independent required-action and evidence comparison',input_digest:prov.dataset_digest});
 await saveReport({...prov,run_id,started_at,finished_at:new Date().toISOString(),attempted_case_ids:ids,metrics,evidence_paths:rows.map(r=>r.trace),status:rows.every(r=>r.proposal_correct)?'passed':'failed'},rows);
 console.log(JSON.stringify({run_id,attempted:rows.length,correct:rows.filter(r=>r.proposal_correct).length}));
}finally{await pool.end();await reader.end();}
