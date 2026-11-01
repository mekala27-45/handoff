import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { reportSchema,renderClaims } from '../packages/domain/claims.js';
import { digest,sha256 } from '../packages/domain/canonical.js';

type Item=Record<string,any>;
const metrics:Record<string,(row:Item)=>boolean>={proposal_correctness:r=>r.proposal_correct===true,actual_tool_execution:r=>r.tool_requests>0&&r.model_calls>0,valid_required_evidence:r=>r.evidence_valid===true,unsafe_proposed_action:r=>r.unsafe_proposal===true,unclassified_missing_output:r=>r.unclassified===true};
const allowed=new Set(['effective_tool_inventory','model_started','model_settled','model_tool_request','model_tool_admission','tool_result','usage_recorded','eve_result','eve_call_settled']);
const forbiddenKey=/^(?:reasoning(?:_text|Text)?|chain_of_thought|error|authorization|capability|messages|prompt|system|providerMetadata)$/i;
const safeIdentifier=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_.:/-]{1,100}$/.test(v)?v:null;
function scrub(value:any):any{if(Array.isArray(value))return value.map(scrub);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!forbiddenKey.test(key)).map(([key,v])=>[key,scrub(v)]));return value;}
function safeEntry(event:Item){
 assert.ok(typeof event.type==='string'&&typeof event.at==='string','malformed_trace_entry');
 if(event.type==='eve_call_settled')return {at:event.at,type:event.type,data:{call_id:safeIdentifier(event.data?.call_id),outcome:safeIdentifier(event.data?.outcome),error_code:safeIdentifier(event.data?.error?.code)}};
 if(['model_started','model_settled'].includes(event.type)){const data:Item={};for(const key of ['runId','modelId','finishReason','outcome'])if(safeIdentifier(event.data?.[key]))data[key]=event.data[key];if(Number.isInteger(event.data?.attempt))data.attempt=event.data.attempt;return {at:event.at,type:event.type,data};}
 return {at:event.at,type:event.type,data:scrub(event.data)};
}
function assertPublic(value:unknown){const text=JSON.stringify(value);assert.ok(!/(?:npg_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{24,}|sk-proj-[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@(?!localhost|127\.0\.0\.1))/.test(text),'private_value_in_public_experiment');}

export function prepareModelExperiment(input:{manifest:unknown;rows:Item[];traces:Item[];plan:Item;registered:Item;frozen:Item|null;planHash?:string}){
 const {rows,traces,plan,registered,frozen}=input,report=reportSchema.parse(input.manifest);assert.equal(report.mode,'local-model');
 assert.equal(report.dataset_digest,registered.dataset_digest);assert.equal(report.policy_digest,registered.policy_digest);assert.equal(report.model_digest,plan.model_digest);
 const splits=new Set(report.metrics.map(m=>m.split));assert.equal(splits.size,1,'mixed_experiment_splits');const split=report.metrics[0]!.split;
 const prior=(plan.prior_attempts??[]).find((p:Item)=>p.source_commit===report.source_commit&&JSON.stringify(p.case_ids)===JSON.stringify(report.attempted_case_ids));
 const kind=split==='held-out'?'held-out':prior?'prior-development':'development';
 if(prior){if(prior.configuration_digest)assert.equal(report.configuration_digest,prior.configuration_digest,'prior_configuration_digest');if(prior.run_id)assert.equal(report.run_id,prior.run_id,'prior_run_identity');assert.equal(report.metrics.find(m=>m.metric_id==='proposal_correctness')?.numerator,prior.acceptable_proposals,'prior_recorded_outcome');}
 const ids=kind==='prior-development'?prior.case_ids:split==='held-out'?plan.held_out_case_ids:plan.development_case_ids;
 assert.ok(Array.isArray(ids)&&ids.length>0,'missing_declared_scope');assert.deepEqual(report.attempted_case_ids,ids,'experiment_attempted_ids');
 assert.ok(ids.every((id:string)=>registered.cases.some((c:Item)=>c.fixture_id===id&&c.split===split)),'experiment_split_scope');
 if(kind!=='prior-development'){const families=ids.map((id:string)=>registered.cases.find((c:Item)=>c.fixture_id===id).family);assert.equal(ids.length,16);assert.equal(new Set(families).size,8);assert.ok(families.every((family:string)=>families.filter((f:string)=>f===family).length===2),'experiment_balance');}
 if(split==='held-out'){assert.ok(frozen?.configuration_digest,'missing_frozen_configuration');assert.equal(digest(frozen.configuration),frozen.configuration_digest,'invalid_frozen_configuration');assert.equal(report.configuration_digest,frozen.configuration_digest,'experiment_frozen_digest');assert.ok(input.planHash,'missing_plan_hash');assert.equal(frozen.configuration.files['eval/plans/model-experiment-v3.json'],input.planHash,'frozen_plan_hash_mismatch');assert.ok(ids.every((id:string)=>!registered.model_subset.includes(id)),'original_heldout_reused');}
 assert.equal(rows.length,ids.length,'incomplete_experiment_rows');assert.deepEqual(rows.map(r=>r.fixture_id),ids,'experiment_row_identity');
 assert.deepEqual(report.evidence_paths,rows.map(r=>r.trace),'experiment_evidence_paths');
 for(const row of rows){assert.equal(row.terminal_record,true,'unterminated_experiment_row');for(const key of ['proposal_correct','evidence_valid','unsafe_proposal','unclassified'])assert.equal(typeof row[key],'boolean','missing_case_grade:'+key);for(const key of ['model_calls','tool_requests'])assert.ok(Number.isInteger(row[key])&&row[key]>=0,'missing_case_usage:'+key);}
 assert.equal(report.metrics.length,Object.keys(metrics).length,'missing_experiment_metric');
 for(const [id,count] of Object.entries(metrics)){const matches=report.metrics.filter(m=>m.metric_id===id);assert.equal(matches.length,1,'missing_or_duplicate_metric');assert.equal(matches[0]!.denominator,ids.length,'experiment_metric_denominator');assert.equal(matches[0]!.numerator,rows.filter(count).length,'experiment_metric_numerator');}
 assert.equal(report.status,rows.every(r=>r.proposal_correct)?'passed':'failed','experiment_status_mismatch');
 assert.equal(traces.length,ids.length,'missing_experiment_trace');
 const trace_cases=rows.map((row,i)=>{const trace=traces[i]!;assert.equal(trace.run_id,report.run_id+'-'+row.fixture_id,'experiment_trace_run_id');for(const key of ['source_commit','configuration_digest','model_digest','dataset_digest','policy_digest'])assert.equal(trace[key],report[key as keyof typeof report],'experiment_trace_provenance:'+key);assert.ok(Array.isArray(trace.trace),'missing_trace_entries');assert.equal(row.model_calls,trace.trace.filter((e:Item)=>e.type==='effective_tool_inventory').length,'model_call_count_mismatch');assert.equal(row.tool_requests,trace.trace.filter((e:Item)=>e.type==='model_tool_request').length,'tool_call_count_mismatch');return {fixture_id:row.fixture_id,run_id:trace.run_id,source_commit:trace.source_commit,configuration_digest:trace.configuration_digest,model_digest:trace.model_digest,entries:trace.trace.filter((e:Item)=>allowed.has(e.type)).map(safeEntry)};});
 const publicRows=rows.map(row=>Object.fromEntries(['fixture_id','action','expected_action','proposal_correct','evidence_valid','unsafe_proposal','unclassified','model_calls','tool_requests','elapsed_ms'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]])));
 const result={...report,experiment_kind:kind,split,title:kind==='prior-development'?'Agent v3 prior development: '+prior.operating_point:split==='held-out'?'Agent v3 held-out evaluation':'Agent v3 development evaluation',filename:report.run_id+'.json',cases_filename:report.run_id+'-cases.json',traces_filename:report.run_id+'-traces.json',trace_cases,summary:renderClaims(report),changes:kind==='prior-development'?['Recorded operating point: '+prior.operating_point+'. Inspect the immutable source commit for its exact instructions and tool schema.']:plan.changes,comparison_limits:['Recorded actual CPU inference; no public live model inference.','Original CPU model v2 is preserved on its original subset. The v3 held-out subset is different, so these are not paired before/after results.','The same model weights were used with changed tool input and instructions. The operating system and database environment also differ from v2.','No model proposal was approved or executed. Model effect safety is not evaluated.']};
 assertPublic(result);assertPublic(publicRows);return {entry:result,rows:publicRows};
}

async function publish(){
 const ids=process.argv.slice(2);assert.ok(ids.length>0,'explicit_experiment_run_ids_required');assert.equal(new Set(ids).size,ids.length,'duplicate_run_ids');
 const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
 const planText=await readFile('eval/plans/model-experiment-v3.json','utf8'),plan=JSON.parse(planText),planHash=sha256(planText.replace(/\r\n/g,'\n')),registered=await read('eval/plans/registered.json'),frozen=await read('eval/plans/model-config-v3.json').catch(()=>null),index=await read('apps/site/public/reports/index.json');
 const prepared=[];for(const id of ids){assert.match(id,/^[A-Za-z0-9_-]{1,80}$/);const manifest=await read('reports/runs/'+id+'.json'),rows=await read('reports/runs/'+id+'-cases.json');const traces=[];for(const row of rows){assert.match(row.trace,/^reports\/model-traces\/[A-Za-z0-9_-]+\.json$/);traces.push(await read(row.trace));}prepared.push(prepareModelExperiment({manifest,rows,traces,plan,registered,frozen,planHash}));}
 await mkdir('reports/public',{recursive:true});index.model_experiments??={};
 for(const {entry,rows} of prepared){const {trace_cases,...publicEntry}=entry;const original=reportSchema.parse(await read('reports/runs/'+entry.run_id+'.json'));for(const dir of ['apps/site/public/reports','reports/public']){await writeFile(dir+'/'+entry.filename,JSON.stringify(original,null,2)+'\n');await writeFile(dir+'/'+entry.cases_filename,JSON.stringify(rows,null,2)+'\n');await writeFile(dir+'/'+entry.traces_filename,JSON.stringify(trace_cases,null,2)+'\n');}index.model_experiments[entry.run_id]={...publicEntry,trace_cases};}
 await writeFile('apps/site/public/reports/index.json',JSON.stringify(index,null,2)+'\n');console.log(JSON.stringify({published_model_experiments:prepared.map(x=>x.entry.run_id)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await publish();
