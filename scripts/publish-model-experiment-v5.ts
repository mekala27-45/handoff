import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest} from '../packages/domain/canonical.js';
import {renderClaims} from '../packages/domain/claims.js';
import {verifyRecordedV5} from '../eval/harness/verify-recorded-v5.js';
import {verifyV5Selection} from '../eval/harness/model-selection-v5.js';
type Item=Record<string,any>;
const allowed=new Set(['effective_tool_inventory','model_started','model_settled','model_tool_request','model_tool_admission','tool_result','usage_recorded','eve_result','eve_call_settled']);
const forbidden=/^(?:reasoning(?:_text|Text)?|chain_of_thought|error|authorization|capability|messages|prompt|system|providerMetadata)$/i;
const safeId=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_.:/-]{1,100}$/.test(v)?v:null;
function scrub(value:any):any{if(Array.isArray(value))return value.map(scrub);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!forbidden.test(key)).map(([k,v])=>[k,scrub(v)]));return value;}
export function publicV5Trace(trace:Item){
 const entries=trace.trace.filter((e:Item)=>allowed.has(e.type)).map((event:Item)=>{
  assert.ok(Number.isFinite(Date.parse(event.at)));
  if(['model_started','model_settled','eve_call_settled'].includes(event.type)){
   const data:Item={};for(const key of ['runId','modelId','finishReason','outcome','call_id'])if(safeId(event.data?.[key]))data[key]=event.data[key];
   if(Number.isInteger(event.data?.attempt))data.attempt=event.data.attempt;
   return {at:event.at,type:event.type,data};
  }
  return {at:event.at,type:event.type,data:scrub(event.data)};
 });
 const result={run_id:trace.run_id,source_commit:trace.source_commit,configuration_digest:trace.configuration_digest,model_digest:trace.model_digest,entries};
 assert.ok(!/(?:npg_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{24,}|sk-proj-[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@)/.test(JSON.stringify(result)),'private_value_in_public_trace');return result;
}
export function appendV5Experiments(index:Item,entries:Item[]){
 const next={...index,model_experiments_v5:{...(index.model_experiments_v5??{})}};
 for(const entry of entries){const old=next.model_experiments_v5[entry.run_id];if(old)assert.equal(digest(old),digest(entry),'published_v5_evidence_is_immutable');next.model_experiments_v5[entry.run_id]=entry;}
 return next;
}
async function publish(){
 const ids=process.argv.slice(2);assert.ok(ids.length>0&&new Set(ids).size===ids.length,'explicit_unique_runs_required');
 const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
 const plan=await read('eval/plans/model-experiment-v5.json'),registered=await read('eval/plans/registered.json'),frozen=await read('eval/plans/model-config-v5.json'),truth=await read('eval/truth/expected.json'),fixtures=await read('packages/fixtures/data/cases.json'),policy=await read('packages/fixtures/data/policy.json');
 verifyV5Selection(plan,registered,await read('eval/plans/model-experiment-v3.json'),await read('eval/plans/model-experiment-v4.json'));assert.equal(digest(frozen.configuration),frozen.configuration_digest);assert.equal(frozen.configuration.version,5);
 const entries=[];
 for(const id of ids){
  assert.match(id,/^model-(?:development|heldout)-v5-\d+$/);const split=id.startsWith('model-development-')?'development':'held-out',report=await read('reports/runs/'+id+'.json'),rows=await read('reports/runs/'+id+'-cases.json'),traces=[];
  for(const row of rows){assert.match(row.trace,/^reports\/model-traces\/model-(?:development|heldout)-v5-\d+-fx_[a-f0-9]{20}\.json$/);traces.push(await read(row.trace));}
  const att=await read('reports/checks/model-v5-'+(split==='development'?'pre-freeze':'heldout')+'.json');assert.equal(att.run_id,id);assert.equal(att.source_commit,report.source_commit);assert.equal(att.configuration_digest,report.configuration_digest);assert.equal(att.independently_regraded,true);
  const checked=verifyRecordedV5({report,rows,traces,fixtures,policy,truth,expectedCaseIds:split==='development'?plan.development_case_ids:plan.held_out_case_ids,split,configurationDigest:frozen.configuration_digest,modelDigest:plan.model_digest,datasetDigest:registered.dataset_digest,policyDigest:registered.policy_digest,modelName:plan.model});
  for(const [name,value] of Object.entries(checked.counts))assert.deepEqual(att.counts[name],value,'authenticated_grade_'+name);
  assert.equal(att.counts.review_records,0);assert.equal(checked.counts.approvals,0);assert.equal(checked.counts.effects,0);
  const publicRows=rows.map((r:Item)=>({fixture_id:r.fixture_id,action:r.action,expected_action:r.expected_action,amount_cents:r.stored_proposal?.amount_cents??null,expected_amount_cents:truth.find((t:Item)=>t.fixture_id===r.fixture_id).amount_cents,proposal_id:r.stored_proposal?.proposal_id??null,proposal_correct:r.proposal_correct,evidence_valid:r.evidence_valid,unsafe_proposal:r.unsafe_proposal,unclassified:r.unclassified,validation:r.validation,validation_reasons:r.validation_reasons,model_calls:r.model_calls,tool_requests:r.tool_requests,elapsed_ms:r.elapsed_ms}));
  const trace_cases=traces.map((trace,i)=>({fixture_id:rows[i].fixture_id,...publicV5Trace(trace)}));
  const entry={...checked.report,model:plan.model,experiment_version:5,experiment_kind:split,split,title:'Agent v5 '+split+' evaluation',filename:id+'.json',cases_filename:id+'-cases.json',traces_filename:id+'-traces.json',trace_cases,summary:renderClaims(checked.report),changes:plan.changes,comparison_limits:plan.comparison_limits,counts:att.counts,original_evidence:{workflow_run_id:att.original_evidence.workflow_run_id,artifact_id:att.original_evidence.artifact_id}};
  entries.push(entry);
  for(const dir of ['apps/site/public/reports','reports/public']){await mkdir(dir,{recursive:true});for(const [file,value] of [[entry.filename,checked.report],[entry.cases_filename,publicRows],[entry.traces_filename,trace_cases]] as const)await writeFile(dir+'/'+file,JSON.stringify(value,null,2)+'\n');}
 }
 const path='apps/site/public/reports/index.json',index=await read(path);await writeFile(path,JSON.stringify(appendV5Experiments(index,entries),null,2)+'\n');console.log(JSON.stringify({published_v5_runs:entries.map(e=>e.run_id)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await publish();
