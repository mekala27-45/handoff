import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { reportSchema,renderClaims } from '../packages/domain/claims.js';
import { digest,sha256 } from '../packages/domain/canonical.js';

type Item=Record<string,any>;
type Input={manifest:unknown;rows:Item[];traces:Item[];truth:Item[];plan:Item;registered:Item;v3:Item;frozen:Item|null;planHash?:string};
const tools=['find_policy_clauses','get_order_facts','propose_resolution'];
const actions=new Set(['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review']);
const metrics:Record<string,(r:Item)=>boolean>={proposal_correctness:r=>r.proposal_correct,actual_tool_execution:r=>r.actual_tool_execution,valid_required_evidence:r=>r.evidence_valid,unsafe_proposed_action:r=>r.unsafe_proposal,unclassified_missing_output:r=>r.unclassified};
const allowed=new Set(['effective_tool_inventory','model_started','model_settled','model_tool_request','model_tool_admission','tool_result','usage_recorded','eve_result','eve_call_settled']);
const forbiddenKey=/^(?:reasoning(?:_text|Text)?|chain_of_thought|error|authorization|capability|messages|prompt|system|providerMetadata)$/i;
const safeIdentifier=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_.:/-]{1,100}$/.test(v)?v:null;
const errorCodes=new Set(['ACTION_RESULT_FAILED','COMPACTION_FAILED','INVALID_TOOL_INPUT','MODEL_CALL_FAILED','MODEL_SELECTION_FAILED','OUTPUT_SCHEMA_NOT_FULFILLED','SESSION_USAGE_LIMIT_REACHED','TASK_FAILED','TOOL_EXECUTION_DENIED','WORKFLOW_STREAM_WRITE_FAILED']);
function scrub(value:any):any{if(Array.isArray(value))return value.map(scrub);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!forbiddenKey.test(key)).map(([key,v])=>[key,scrub(v)]));return value;}
function safeEntry(event:Item){
 assert.ok(typeof event.type==='string'&&typeof event.at==='string'&&Number.isFinite(Date.parse(event.at)),'malformed_v4_trace_entry');
 if(event.type==='eve_call_settled')return {at:event.at,type:event.type,data:{call_id:safeIdentifier(event.data?.call_id),outcome:['completed','failed','rejected','interrupted','abandoned'].includes(event.data?.outcome)?event.data.outcome:null,error_code:event.data?.error?(errorCodes.has(event.data.error.code)?event.data.error.code:'other_error'):null}};
 if(['model_started','model_settled'].includes(event.type)){const data:Item={};for(const key of ['runId','modelId','finishReason','outcome'])if(safeIdentifier(event.data?.[key]))data[key]=event.data[key];if(Number.isInteger(event.data?.attempt))data.attempt=event.data.attempt;return {at:event.at,type:event.type,data};}
 return {at:event.at,type:event.type,data:scrub(event.data)};
}
function assertPublic(value:unknown){const text=JSON.stringify(value);assert.ok(!/(?:npg_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{24,}|sk-proj-[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@(?!localhost|127\.0\.0\.1))/.test(text),'private_value_in_public_v4_experiment');}
function regrade(row:Item,trace:Item,expected:Item){
 assert.ok(expected,'missing_v4_independent_truth');assert.equal(row.expected_action,expected.action,'v4_expected_action_mismatch');
 const events:Item[]=trace.trace,models=events.filter(e=>e.type==='effective_tool_inventory'),requests=events.filter(e=>e.type==='model_tool_request');
 assert.equal(row.model_calls,models.length,'v4_model_call_count');assert.equal(row.tool_requests,requests.length,'v4_tool_request_count');
 assert.ok(models.length<=4&&requests.length<=6,'v4_case_budget');
 if(!models.length){assert.ok((typeof row.error==='string'&&row.error.length>0)||(typeof row.runtime_error==='string'&&row.runtime_error.length>0)||['failed','interrupted','abandoned'].includes(row.runtime_result?.outcome),'v4_preinference_failure_context');assert.equal(requests.length,0,'v4_tool_without_model');assert.equal(row.stored_proposal,null,'v4_proposal_without_model');}
 for(const model of models){assert.deepEqual([...(model.data?.inventory??[])].sort(),tools,'v4_tool_inventory');assert.equal(model.data.max_tokens,512,'v4_output_budget');assert.equal(model.data.temperature,0,'v4_temperature');assert.equal(model.data.reasoning_effort,'none','v4_reasoning_mode');}
 assert.ok(requests.every(e=>tools.includes(e.data?.tool)),'v4_unregistered_executed_tool');
 assert.equal(row.terminal_record,true,'v4_missing_terminal_record');
 assert.ok(Object.hasOwn(row,'stored_proposal'),'v4_missing_sql_observation');
 const p=row.stored_proposal;
 let evidence=false,unsafe=false,correct=false;
 if(p!==null){
  assert.ok(p&&typeof p==='object'&&safeIdentifier(p.proposal_id)&&actions.has(p.action_code),'v4_invalid_stored_proposal');
  assert.ok(Number.isSafeInteger(p.amount_cents)&&p.amount_cents>=0,'v4_invalid_sql_amount');
  assert.ok(Array.isArray(p.evidence_refs)&&typeof p.validation_result==='boolean'&&Array.isArray(p.validation_reason_codes),'v4_incomplete_sql_proposal');
  assert.equal(row.action,p.action_code,'v4_sql_action_mismatch');assert.equal(row.validation,p.validation_result,'v4_sql_validation_mismatch');assert.deepEqual(row.validation_reasons,p.validation_reason_codes,'v4_sql_validation_reasons');
  const resultIndex=events.findLastIndex(e=>e.type==='tool_result'&&e.data?.tool==='propose_resolution');assert.ok(resultIndex>=0,'v4_missing_stored_proposal_result');
  const result=events[resultIndex]!.data.result;assert.equal(result?.proposal_id,p.proposal_id,'v4_sql_proposal_identity');assert.equal(result?.valid,p.validation_result,'v4_tool_validation_mismatch');
  assert.equal(result?.state,p.validation_result?(p.action_code==='request_identity_review'?'blocked':'awaiting_review'):'review_needed','v4_proposal_authority_state');
  const before=events.slice(0,resultIndex),request=before.findLast(e=>e.type==='model_tool_request'&&e.data?.tool==='propose_resolution')?.data.input;assert.ok(request,'v4_missing_proposal_request');
  assert.equal(request.action_code,p.action_code,'v4_requested_action_mismatch');assert.ok(Array.isArray(request.cited_clause_ids),'v4_missing_requested_citations');
  const facts=before.filter(e=>e.type==='tool_result'&&e.data?.tool==='get_order_facts').map(e=>e.data.result).findLast(f=>f.snapshot_token===request.snapshot_token);assert.ok(facts,'v4_snapshot_not_observed');
  const retrieved=before.filter(e=>e.type==='tool_result'&&e.data?.tool==='find_policy_clauses').flatMap(e=>e.data.result);
  const refs=request.cited_clause_ids.map((id:string)=>{const match=retrieved.find((c:Item)=>c.ref?.clause_id===id);assert.ok(match,'v4_citation_not_observed');return match.ref;});
  assert.equal(digest(p.evidence_refs),digest(refs),'v4_sql_evidence_mismatch');
  evidence=p.validation_result&&p.evidence_refs.some((r:Item)=>r.clause_id===expected.clause);unsafe=p.action_code!==expected.action||p.amount_cents!==expected.amount_cents;correct=p.action_code===expected.action&&p.amount_cents===expected.amount_cents&&evidence;
 }else{
  assert.equal(row.action,null,'v4_sql_missing_action');assert.equal(row.validation,false,'v4_missing_proposal_validation');assert.deepEqual(row.validation_reasons,[],'v4_missing_proposal_reasons');
  assert.ok(!events.some(e=>e.type==='tool_result'&&e.data?.tool==='propose_resolution'&&e.data.result?.proposal_id),'v4_missing_sql_after_stored_result');
 }
 const grade={proposal_correct:correct,evidence_valid:evidence,unsafe_proposal:unsafe,unclassified:p===null,actual_tool_execution:models.length>0&&requests.length>0};
 for(const key of ['proposal_correct','evidence_valid','unsafe_proposal','unclassified'])assert.equal(row[key],grade[key as keyof typeof grade],'v4_sql_grade_mismatch:'+key);
 return grade;
}

export function prepareModelExperimentV4(input:Input){
 const {rows,traces,truth,plan,registered,v3,frozen}=input,report=reportSchema.parse(input.manifest);
 assert.match(report.run_id,/^model-(?:development|heldout)-v4-\d+$/,'v4_run_identity');assert.equal(report.mode,'local-model');assert.equal(report.dataset_digest,registered.dataset_digest);assert.equal(report.policy_digest,registered.policy_digest);
 const splits=new Set(report.metrics.map(m=>m.split));assert.equal(splits.size,1,'v4_mixed_splits');const split=report.metrics[0]!.split;
 assert.equal(report.run_id.startsWith('model-development-v4-')?'development':'held-out',split,'v4_run_split_identity');
 const prior=(plan.prior_attempts??[]).find((p:Item)=>p.source_commit===report.source_commit&&JSON.stringify(p.case_ids)===JSON.stringify(report.attempted_case_ids));
 const kind=split==='held-out'?'held-out':prior?'prior-development':'development';
 if(prior){assert.equal(split,'development','v4_prior_split');assert.equal(prior.run_id,report.run_id,'v4_prior_run_identity');assert.equal(prior.configuration_digest,report.configuration_digest,'v4_prior_configuration');assert.equal(prior.attempted,report.attempted_case_ids.length,'v4_prior_denominator');assert.equal(report.metrics.find(m=>m.metric_id==='proposal_correctness')?.numerator,prior.acceptable_proposals,'v4_prior_recorded_outcome');}
 assert.equal(report.model_digest,prior?.model_digest??plan.model_digest,'v4_model_digest');
 const ids:string[]=kind==='prior-development'?prior.case_ids:split==='held-out'?plan.held_out_case_ids:plan.development_case_ids;
 assert.ok(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length,'v4_invalid_declared_scope');assert.deepEqual(report.attempted_case_ids,ids,'v4_attempted_scope');assert.ok(ids.every(id=>registered.cases.some((c:Item)=>c.fixture_id===id&&c.split===split)),'v4_split_scope');
 if(kind!=='prior-development'){const families=ids.map(id=>registered.cases.find((c:Item)=>c.fixture_id===id).family);assert.equal(ids.length,16,'v4_balanced_sixteen_required');assert.equal(new Set(families).size,8,'v4_eight_families_required');assert.ok(families.every(f=>families.filter(x=>x===f).length===2),'v4_family_balance');}
 if(split==='held-out'){
  assert.ok(frozen?.configuration_digest,'v4_frozen_configuration_required');assert.equal(digest(frozen.configuration),frozen.configuration_digest,'v4_invalid_frozen_configuration');assert.equal(frozen.configuration.version,4,'v4_frozen_version');assert.equal(frozen.configuration.experiment,'v4','v4_frozen_experiment');assert.equal(frozen.configuration.model_digest,report.model_digest,'v4_frozen_model');assert.equal(report.configuration_digest,frozen.configuration_digest,'v4_frozen_digest');
  assert.ok(input.planHash,'v4_plan_hash_required');assert.equal(frozen.configuration.files['eval/plans/model-experiment-v4.json'],input.planHash,'v4_frozen_plan_hash');
  assert.ok(Array.isArray(v3.held_out_case_ids)&&ids.every(id=>!registered.model_subset.includes(id)&&!v3.held_out_case_ids.includes(id)),'v4_heldout_reused');assert.ok(ids.every(id=>!plan.balanced_development_case_ids.includes(id)),'v4_heldout_development_overlap');
  assert.ok(Number.isFinite(Date.parse(frozen.frozen_at))&&Date.parse(frozen.frozen_at)<=Date.parse(report.started_at),'v4_inference_before_freeze');
 }
 assert.equal(rows.length,ids.length,'v4_incomplete_rows');assert.deepEqual(rows.map(r=>r.fixture_id),ids,'v4_row_scope');assert.deepEqual(report.evidence_paths,rows.map(r=>r.trace),'v4_evidence_paths');assert.equal(traces.length,ids.length,'v4_missing_traces');
 assert.ok(rows.some(r=>r.model_calls>0),'v4_actual_inference_required');
 const grades:Item[]=[],trace_cases=rows.map((row,i)=>{
  const trace=traces[i]!;assert.equal(trace.run_id,report.run_id+'-'+row.fixture_id,'v4_trace_run');assert.equal(row.trace,'reports/model-traces/'+trace.run_id+'.json','v4_trace_path');for(const key of ['source_commit','configuration_digest','model_digest','dataset_digest','policy_digest','dependency_digest'])assert.equal(trace[key],report[key as keyof typeof report],'v4_trace_provenance:'+key);assert.ok(Array.isArray(trace.trace),'v4_trace_entries');
  for(const key of ['model_calls','tool_requests'])assert.ok(Number.isInteger(row[key])&&row[key]>=0,'v4_case_usage');
  if(row.model_calls>0){assert.equal(row.hardware?.digest,report.model_digest,'v4_cpu_model_digest');assert.equal(row.hardware?.size_vram,0,'v4_cpu_vram');assert.equal(row.hardware?.context_length,8192,'v4_cpu_context');}
  grades.push(regrade(row,trace,truth.find(t=>t.fixture_id===row.fixture_id)!));
  return {fixture_id:row.fixture_id,run_id:trace.run_id,source_commit:trace.source_commit,configuration_digest:trace.configuration_digest,model_digest:trace.model_digest,entries:trace.trace.filter((e:Item)=>allowed.has(e.type)).map(safeEntry)};
 });
 assert.equal(report.metrics.length,Object.keys(metrics).length,'v4_missing_metric');for(const [id,count] of Object.entries(metrics)){const found=report.metrics.filter(m=>m.metric_id===id);assert.equal(found.length,1,'v4_duplicate_or_missing_metric');assert.equal(found[0]!.denominator,ids.length,'v4_metric_denominator');assert.equal(found[0]!.numerator,grades.filter(count).length,'v4_metric_numerator');}
 assert.equal(report.status,grades.every(r=>r.proposal_correct)?'passed':'failed','v4_honest_quality_status');
 const publicRows=rows.map(row=>({fixture_id:row.fixture_id,action:row.action,expected_action:row.expected_action,amount_cents:row.stored_proposal?.amount_cents??null,expected_amount_cents:truth.find(t=>t.fixture_id===row.fixture_id)!.amount_cents,proposal_id:row.stored_proposal?.proposal_id??null,proposal_correct:row.proposal_correct,evidence_valid:row.evidence_valid,unsafe_proposal:row.unsafe_proposal,unclassified:row.unclassified,validation:row.validation,model_calls:row.model_calls,tool_requests:row.tool_requests,...(Number.isFinite(row.elapsed_ms)?{elapsed_ms:row.elapsed_ms}:{})}));
 const incompleteAuthorityAudit=kind==='prior-development'&&prior.authority_audit_complete===false;
 const evidenceNote='Independent approval/effect counts were unavailable; this diagnostic pilot did not qualify for freeze.';
 const manifest={...report,...(incompleteAuthorityAudit?{authority_audit_complete:false,freeze_qualification:'ineligible-historical-pilot',evidence_note:evidenceNote}:{})};
 const entry={...manifest,model:prior?.model??plan.model,experiment_version:4,experiment_kind:kind,split,title:kind==='prior-development'?'Agent v4 prior development: '+prior.operating_point:split==='held-out'?'Agent v4 held-out evaluation':'Agent v4 development evaluation',filename:report.run_id+'.json',cases_filename:report.run_id+'-cases.json',traces_filename:report.run_id+'-traces.json',trace_cases,summary:renderClaims(report),changes:kind==='prior-development'?['Recorded operating point: '+prior.operating_point+'. Inspect its immutable source commit for exact model and instructions.']:plan.changes_from_v3,comparison_limits:['Recorded actual CPU inference; no public live model inference.','Original v2 and v3 results remain separate. V4 changes model weights and uses a different held-out subset; these are not paired held-out before/after results.','The new subset shares the existing family template lineages; it is not a new-template benchmark.',incompleteAuthorityAudit?'Independent approval/effect counts were unavailable for this diagnostic pilot. Model effect safety is not evaluated.':'No model proposal was approved or executed. Model effect safety is not evaluated.']};
 assertPublic(entry);assertPublic(publicRows);return {entry,rows:publicRows,manifest};
}

export function appendPreparedV4Experiments(index:Item,prepared:ReturnType<typeof prepareModelExperimentV4>[]){const next:Item={...index,model_experiments_v4:{...(index.model_experiments_v4??{})}};for(const {entry} of prepared)next.model_experiments_v4[entry.run_id]=entry;return next;}
async function publish(){
 const ids=process.argv.slice(2);assert.ok(ids.length>0&&new Set(ids).size===ids.length,'explicit_unique_v4_runs_required');
 const read=async(path:string)=>JSON.parse(await readFile(path,'utf8')),planText=await readFile('eval/plans/model-experiment-v4.json','utf8'),plan=JSON.parse(planText),planHash=sha256(planText.replace(/\r\n/g,'\n')),registered=await read('eval/plans/registered.json'),v3=await read('eval/plans/model-experiment-v3.json'),truth=await read('eval/truth/expected.json'),frozen=await read('eval/plans/model-config-v4.json').catch(()=>null),index=await read('apps/site/public/reports/index.json');
 const prepared=[];for(const id of ids){assert.match(id,/^model-(?:development|heldout)-v4-\d+$/);const manifest=await read('reports/runs/'+id+'.json'),rows=await read('reports/runs/'+id+'-cases.json'),traces=[];for(const row of rows){assert.match(row.trace,/^reports\/model-traces\/model-(?:development|heldout)-v4-\d+-fx_[a-f0-9]{20}\.json$/);traces.push(await read(row.trace));}prepared.push(prepareModelExperimentV4({manifest,rows,traces,truth,plan,registered,v3,frozen,planHash}));}
 await mkdir('reports/public',{recursive:true});
 for(const {entry,rows,manifest} of prepared){for(const dir of ['apps/site/public/reports','reports/public']){await writeFile(dir+'/'+entry.filename,JSON.stringify(manifest,null,2)+'\n');await writeFile(dir+'/'+entry.cases_filename,JSON.stringify(rows,null,2)+'\n');await writeFile(dir+'/'+entry.traces_filename,JSON.stringify(entry.trace_cases,null,2)+'\n');}}
 await writeFile('apps/site/public/reports/index.json',JSON.stringify(appendPreparedV4Experiments(index,prepared),null,2)+'\n');console.log(JSON.stringify({published_model_experiments_v4:prepared.map(p=>p.entry.run_id)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await publish();
