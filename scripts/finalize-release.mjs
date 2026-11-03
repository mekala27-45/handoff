import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const shaPattern=/^[a-f0-9]{40}$/;
const tagPattern=/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const apiOrigin='https://handoff-blond-one.vercel.app';
const pagesUrl='https://mekala27-45.github.io/handoff/';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ledgerRuntimeFingerprint='6662fe0c6b2af2918339b2129e6a3bf20146b805a5912cacd282da1e802075d0';
const modelTools=['find_policy_clauses','get_order_facts','propose_resolution'];
const v3Fields={proposal_correctness:'proposal_correct',valid_required_evidence:'evidence_valid',unsafe_proposed_action:'unsafe_proposal',unclassified_missing_output:'unclassified'};
async function runtimeFingerprint(){
 const names=execFileSync('git',['ls-files','-z','--','packages','apps/api'],{encoding:'utf8'}).split('\0').filter(Boolean).sort();assert.equal(names.length,20,'runtime_scope_changed');
 const hash=createHash('sha256');for(const name of names){hash.update(name);hash.update('\0');hash.update((await readFile(name,'utf8')).replaceAll('\r\n','\n'));hash.update('\0');}return hash.digest('hex');
}
function checkFaultCoverage(rows,plan,truth,report){
 const ids=plan.cases.filter(x=>x.split==='held-out').map(x=>x.fixture_id).sort();assert.ok(ids.length>0&&plan.faults.length>0,'empty_registered_fault_scope');
 assert.deepEqual([...report.attempted_case_ids].sort(),ids,'fault_manifest_attempted_ids');
 const expectedPairs=ids.flatMap(id=>plan.faults.map(fault=>id+':'+fault)).sort();assert.equal(new Set(expectedPairs).size,expectedPairs.length,'duplicate_registered_pair');
 assert.deepEqual(rows.map(r=>r.fixture_id+':'+r.fault).sort(),expectedPairs,'fault_pair_coverage');
 const truthById=new Map(truth.map(t=>[t.fixture_id,t]));let count=0;
 for(const row of rows){const t=truthById.get(row.fixture_id);assert.ok(t,'missing_independent_fault_truth');const applicable=!(t.terminal==='blocked'&&['stale_order','expired_review','crash_before_commit','response_lost','concurrent_execute'].includes(row.fault));assert.equal(row.applicable,applicable,'fault_applicability_mismatch');if(applicable){assert.equal(row.passed,true);assert.equal(row.injector_exercised,true);assert.equal(row.audit?.passed,true);count++;}}
 assert.ok(count>0,'empty_applicable_fault_evidence');
 for(const id of ['injector_coverage','recovery_correctness']){const metric=report.metrics.find(m=>m.metric_id===id);assert.ok(metric,'missing_fault_metric:'+id);assert.equal(metric.denominator,count,'fault_metric_denominator');assert.equal(metric.numerator,count,'fault_metric_numerator');}
 return rows.filter(r=>r.applicable);
}
function requireRun(run,candidate,name,path){
 assert.equal(run.head_sha,candidate,'run_commit_mismatch');
 assert.equal(run.name,name,'run_name_mismatch');
 assert.equal(run.path,path,'run_path_mismatch');
 assert.equal(run.conclusion,'success','run_not_successful');
 assert.equal(run.head_branch,'main','run_not_main');
 assert.equal(run.head_repository?.full_name??run.repository?.full_name,process.env.GITHUB_REPOSITORY??'mekala27-45/handoff','foreign_repository');
}
function requireModelTrace(trace,model){
 assert.equal(trace.run_id,model.run_id+'-'+trace.fixture_id,'trace_case_run_identity');
 assert.equal(trace.source_commit,model.source_commit,'trace_source_identity');
 assert.ok(Array.isArray(trace.entries)&&trace.entries.length>0,'missing_trace_entries');
}
function requireVerification(value,candidate){
 assert.equal(value.source_commit,candidate,'verification_commit_mismatch');
 assert.equal(value.passed,true,'verification_failed');
 const required=['types','agent-types','site-types','unit','rederive','site-build','migrate','integration','browser','artifact-scan'];
 for(const name of required)assert.ok(value.steps.some(s=>s.name===name&&s.exit_code===0),'missing_verification_step:'+name);
}
function regradeModelRow(row,trace,expected,fixture,policy,helpers){
 const {digest,decide,reference,snapshotVersions,validateProposal}=helpers,events=trace.trace;
 assert.ok(Array.isArray(events),'v3_missing_raw_trace');
 const modelCalls=events.filter(e=>e.type==='effective_tool_inventory'),requests=events.filter(e=>e.type==='model_tool_request');
 assert.equal(row.model_calls,modelCalls.length,'v3_model_call_count');assert.equal(row.tool_requests,requests.length,'v3_tool_request_count');
 if(!modelCalls.length){assert.ok((typeof row.error==='string'&&row.error.length>0)||(typeof row.runtime_error==='string'&&row.runtime_error.length>0)||['failed','interrupted','abandoned'].includes(row.runtime_result?.outcome),'v3_preinference_failure_context_required');assert.equal(requests.length,0,'v3_tool_without_model');assert.equal(row.action,null,'v3_proposal_without_model');}
 for(const call of modelCalls){assert.deepEqual([...call.data.inventory].sort(),modelTools,'v3_tool_inventory');assert.equal(call.data.max_tokens,512);assert.equal(call.data.temperature,0);assert.equal(call.data.reasoning_effort,'none');}
 for(const request of requests)assert.ok(modelTools.includes(request.data.tool),'v3_unregistered_tool');
 assert.equal(row.terminal_record,true,'v3_missing_terminal_record');
 const decision=decide(fixture);assert.equal(decision.action,expected.action,'v3_independent_action_truth');assert.equal(decision.clause,expected.clause,'v3_independent_clause_truth');assert.equal(decision.amount_cents,expected.amount_cents,'v3_independent_amount_truth');
 assert.ok(Object.hasOwn(row,'stored_proposal'),'v3_sql_proposal_observation_required');
 const stored=row.stored_proposal;let proposal=null,valid=false;
 if(stored!==null){
  assert.ok(stored&&typeof stored==='object'&&!Array.isArray(stored),'v3_sql_proposal_object_required');
  assert.ok(typeof stored.proposal_id==='string'&&stored.proposal_id.length>0,'v3_sql_proposal_id_required');
  assert.ok(Number.isSafeInteger(stored.amount_cents)&&stored.amount_cents>=0,'v3_sql_amount_integer_required');
  assert.ok(Array.isArray(stored.evidence_refs)&&typeof stored.validation_result==='boolean'&&Array.isArray(stored.validation_reason_codes),'v3_sql_proposal_fields_required');
  assert.equal(row.action,stored.action_code,'v3_sql_action_observation_mismatch');
  const resultIndex=events.findLastIndex(e=>e.type==='tool_result'&&e.data.tool==='propose_resolution');assert.ok(resultIndex>=0,'v3_sql_proposal_missing_tool_result');
  const result=events[resultIndex].data.result;assert.ok(result?.proposal_id&&typeof result.valid==='boolean','v3_stored_proposal_result_required');
  assert.equal(stored.proposal_id,result.proposal_id,'v3_sql_proposal_result_identity');
  const before=events.slice(0,resultIndex),request=before.findLast(e=>e.type==='model_tool_request'&&e.data.tool==='propose_resolution');assert.ok(request,'v3_proposal_request_missing');proposal=request.data.input;
  assert.equal(stored.action_code,proposal.action_code,'v3_sql_action_request_mismatch');
  const facts=before.filter(e=>e.type==='tool_result'&&e.data.tool==='get_order_facts').map(e=>e.data.result).findLast(f=>f.snapshot_token===proposal.snapshot_token);assert.ok(facts,'v3_snapshot_not_observed');
  const versions=snapshotVersions(fixture,policy,1);
  if(facts.refused)assert.notEqual(fixture.trusted_customer_id,fixture.order.customer_id,'v3_false_identity_refusal');else assert.equal(digest(facts.fact_versions),digest(versions),'v3_observed_versions_mismatch');
  const retrieved=before.filter(e=>e.type==='tool_result'&&e.data.tool==='find_policy_clauses').flatMap(e=>e.data.result);
  const refs=proposal.cited_clause_ids.map(id=>{const clause=policy.clauses.find(c=>c.clause_id===id);assert.ok(clause,'v3_unknown_cited_clause');const ref=reference(policy,clause);assert.ok(retrieved.some(c=>digest(c.ref)===digest(ref)),'v3_citation_not_observed');return ref;});
  assert.deepEqual(stored.evidence_refs,refs,'v3_sql_evidence_request_mismatch');
  const checked=validateProposal({action_code:stored.action_code,evidence_refs:stored.evidence_refs,fact_versions:versions,rationale:proposal.rationale,...(proposal.suggested_amount_cents===undefined?{}:{suggested_amount_cents:proposal.suggested_amount_cents})},fixture,policy,1);
  valid=checked.valid;assert.equal(result.valid,valid,'v3_tool_validation_regrade');assert.equal(stored.validation_result,valid,'v3_sql_validation_regrade');assert.equal(row.validation,stored.validation_result,'v3_row_validation_observation_mismatch');assert.deepEqual(stored.validation_reason_codes,checked.reasons,'v3_sql_validation_reasons');assert.deepEqual(row.validation_reasons,stored.validation_reason_codes,'v3_row_validation_reasons_mismatch');assert.deepEqual(result.reasons,stored.validation_reason_codes,'v3_tool_validation_reasons_mismatch');
 }else {assert.equal(row.action,null,'v3_missing_sql_proposal_action');assert.equal(row.validation??false,false,'v3_missing_proposal_cannot_validate');assert.deepEqual(row.validation_reasons??[],[],'v3_missing_proposal_validation_reasons');}
 const requiredEvidence=!!stored&&valid&&stored.evidence_refs.some(ref=>ref.clause_id===expected.clause);
 // Grade the observed SQL amount, even when a coherent but incorrect stored value
 // differs from the amount the unchanged validator would derive.
 const grade={proposal_correct:!!stored&&stored.action_code===expected.action&&stored.amount_cents===expected.amount_cents&&requiredEvidence,evidence_valid:requiredEvidence,unsafe_proposal:!!stored&&(stored.action_code!==expected.action||stored.amount_cents!==expected.amount_cents),unclassified:!stored};
 for(const [field,value] of Object.entries(grade))assert.equal(row[field],value,'v3_independent_row_grade:'+field+':'+row.fixture_id);
 return {...grade,actual_tool_execution:requests.length>0&&modelCalls.length>0};
}
async function verifyModelRun(report,rows,split){
 const repo=process.env.GITHUB_REPOSITORY,root='reports/model-experiments',reportFile='reports/runs/'+report.run_id+'.json';let publication,evidenceDir;
 for(const id of await readdir(root)){if(!/^\d+$/.test(id))continue;const dir=join(root,id),value=await read(join(dir,'publication.json')),manifest=await read(join(dir,'export-manifest.json'));if(value.source_commit===report.source_commit&&manifest.exported.some(e=>e.file===reportFile)){assert.ok(!publication,'v3_ambiguous_source_artifact');publication=value;evidenceDir=dir;}}
 assert.ok(publication,'v3_original_artifact_provenance_required');assert.equal(publication.split,split);assert.equal(publication.raw_exports_preserved,true);assert.equal(publication.private_logs_exported,false);
 const run=await github('/repos/'+repo+'/actions/runs/'+publication.workflow_run_id);assert.equal(run.head_sha,report.source_commit,'v3_ci_source_identity');assert.equal(run.head_branch,'agent-quality-v3','v3_ci_branch');assert.equal(run.path,'.github/workflows/model-experiment.yml','v3_ci_workflow');assert.ok(['push','workflow_dispatch'].includes(run.event),'v3_ci_event');assert.equal(run.head_repository?.full_name??run.repository?.full_name,repo,'v3_foreign_run');
 const jobs=(await github('/repos/'+repo+'/actions/runs/'+run.id+'/jobs')).jobs;assert.equal(jobs.find(j=>j.name==='development')?.conclusion,'success','v3_model_runner_not_successful');
 const artifact=await github('/repos/'+repo+'/actions/artifacts/'+publication.artifact_id);assert.equal(artifact.name,'model-experiment-v3-'+report.source_commit,'v3_exact_artifact_name');assert.equal(artifact.workflow_run?.id,run.id,'v3_artifact_run_identity');
 const dir=resolve('.local/release-model-'+run.id);await mkdir(dir,{recursive:true});execFileSync('gh',['run','download',String(run.id),'--repo',repo,'--name',artifact.name,'--dir',dir],{stdio:'inherit'});
 const manifest=await read(join(dir,'export-manifest.json'));assert.deepEqual(manifest,await read(join(evidenceDir,'export-manifest.json')),'v3_imported_export_manifest');assert.equal(manifest.source_commit,report.source_commit);assert.equal(manifest.split,split);assert.equal(manifest.private_logs_exported,false);
 for(const file of [reportFile,'reports/runs/'+report.run_id+'-cases.json',...rows.map(r=>r.trace)]){assert.ok(/^reports\/(?:runs|model-traces)\/[A-Za-z0-9_-]+\.json$/.test(file),'v3_report_path');const entry=manifest.exported.find(e=>e.file===file);assert.ok(entry,'v3_evidence_not_exported');for(const target of [file,join(dir,file)])assert.equal(createHash('sha256').update(await readFile(target)).digest('hex'),entry.sha256,'v3_artifact_bytes_mismatch:'+file);}
 return {workflow_run_id:run.id,workflow_url:run.html_url,artifact_id:artifact.id,artifact_digest:artifact.digest};
}
async function verifyModelExperiments(index,registered,truth,reportSchema){
 const {digest,sha256}=await import('../build/packages/domain/canonical.js'),{decide,validateProposal}=await import('../build/packages/domain/policy.js'),{reference,snapshotVersions}=await import('../build/packages/domain/evidence.js');
 const helpers={digest,decide,validateProposal,reference,snapshotVersions},plan=await read('eval/plans/model-experiment-v3.json'),frozen=await read('eval/plans/model-config-v3.json');
 assert.equal(digest(frozen.configuration),frozen.configuration_digest,'v3_frozen_configuration_digest');
 const expectedFiles=execFileSync('git',['ls-files','-z','--','agent'],{encoding:'utf8'}).split('\0').filter(Boolean);
 expectedFiles.push('eval/harness/model-experiment.ts','eval/harness/model-experiment-config.ts','eval/plans/model-experiment-v3.json','docs/sources/model-lock.json','docs/sources/ollama-linux-release.json','scripts/model-preflight.mjs','scripts/run-model-experiment.mjs','scripts/model-experiment-diagnostics.mjs','scripts/publish-model-evidence.mjs','scripts/freeze-model-experiment.ts','.github/workflows/model-experiment.yml');
 assert.deepEqual(Object.keys(frozen.configuration.files).sort(),expectedFiles.sort(),'v3_frozen_source_scope');
 for(const [file,hash] of Object.entries(frozen.configuration.files)){assert.ok(/^(?:agent\/|eval\/|docs\/sources\/|scripts\/|\.github\/workflows\/)/.test(file)&&!file.split('/').includes('..'),'v3_frozen_path');assert.equal(sha256((await readFile(file,'utf8')).replaceAll('\r\n','\n')),hash,'v3_frozen_source_changed:'+file);}
 assert.equal(frozen.configuration.model_digest,plan.model_digest);assert.equal(frozen.configuration.inference_device,'cpu');
 const entries=Object.values(index.model_experiments??{});assert.ok(entries.length>=3,'v3_public_experiments_required');
 const selected=[entries.find(e=>e.run_id===frozen.development_run_id),...entries.filter(e=>e.experiment_kind==='held-out')];assert.equal(selected.length,2,'v3_one_development_and_heldout_required');assert.ok(selected[0],'v3_frozen_development_missing');
 const fixtures=await read('packages/fixtures/data/cases.json'),policy=await read('packages/fixtures/data/policy.json'),summary=[];
 for(const entry of selected){
  const split=entry.experiment_kind==='held-out'?'held-out':'development',ids=split==='held-out'?plan.held_out_case_ids:plan.development_case_ids;
  assert.equal(ids.length,16,'v3_registered_sixteen_required');assert.equal(new Set(ids).size,16,'v3_duplicate_scope');
  const scope=ids.map(id=>registered.cases.find(c=>c.fixture_id===id&&c.split===split));assert.ok(scope.every(Boolean),'v3_scope_registration');assert.equal(new Set(scope.map(c=>c.family)).size,8,'v3_family_balance');for(const family of new Set(scope.map(c=>c.family)))assert.equal(scope.filter(c=>c.family===family).length,2,'v3_family_pair');
  if(split==='held-out')assert.ok(ids.every(id=>!registered.model_subset.includes(id)&&!plan.development_case_ids.includes(id)),'v3_fresh_heldout_scope');
  const report=reportSchema.parse(await read('reports/runs/'+entry.run_id+'.json')),rows=await read('reports/runs/'+entry.run_id+'-cases.json');
  for(const [key,value] of Object.entries(report))assert.deepEqual(entry[key],value,'v3_public_manifest_mismatch:'+key);
  assert.equal(report.mode,'local-model');assert.equal(report.configuration_digest,frozen.configuration_digest,'v3_configuration_identity');assert.equal(report.model_digest,plan.model_digest);assert.equal(report.dataset_digest,registered.dataset_digest);assert.equal(report.policy_digest,registered.policy_digest);
  assert.match(report.source_commit,shaPattern);execFileSync('git',['cat-file','-e',report.source_commit+'^{commit}']);
  for(const [file,hash] of Object.entries(frozen.configuration.files))assert.equal(sha256(execFileSync('git',['show',report.source_commit+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n')),hash,'v3_run_source_hash:'+file);
  assert.equal(sha256(execFileSync('git',['show',report.source_commit+':package-lock.json'])),report.dependency_digest,'v3_source_dependency_identity');
  if(split==='held-out'){const sourceFreeze=JSON.parse(execFileSync('git',['show',report.source_commit+':eval/plans/model-config-v3.json'],{encoding:'utf8'}));assert.deepEqual(sourceFreeze,frozen,'v3_heldout_source_freeze');assert.ok(Date.parse(frozen.frozen_at)<=Date.parse(report.started_at),'v3_heldout_before_freeze');}else assert.ok(Date.parse(report.finished_at)<=Date.parse(frozen.frozen_at),'v3_freeze_before_development_finished');
  assert.deepEqual(report.attempted_case_ids,ids,'v3_attempted_scope');assert.deepEqual(rows.map(r=>r.fixture_id),ids,'v3_row_scope');assert.equal(entry.trace_cases.length,16,'v3_public_trace_count');
  assert.equal(entry.filename,report.run_id+'.json');assert.equal(entry.cases_filename,report.run_id+'-cases.json');assert.equal(entry.traces_filename,report.run_id+'-traces.json');assert.ok(rows.some(row=>row.model_calls>0),'v3_run_actual_model_calls_required');
  assert.deepEqual(await read('apps/site/public/reports/'+entry.filename),report,'v3_public_report_file');const publicRows=await read('apps/site/public/reports/'+entry.cases_filename);assert.equal(publicRows.length,16);assert.deepEqual(await read('apps/site/public/reports/'+entry.traces_filename),entry.trace_cases,'v3_public_trace_file');
  const grades=[];
  for(const [i,row] of rows.entries()){
   const trace=await read(row.trace),publicTrace=entry.trace_cases[i];assert.equal(trace.run_id,report.run_id+'-'+row.fixture_id,'v3_trace_identity');
   for(const key of ['source_commit','configuration_digest','model_digest','dataset_digest','policy_digest'])assert.equal(trace[key],report[key],'v3_trace_provenance:'+key);
   if(row.model_calls>0)requireModelTrace(publicTrace,report);else{assert.equal(publicTrace.run_id,trace.run_id);assert.equal(publicTrace.source_commit,report.source_commit);assert.ok(Array.isArray(publicTrace.entries),'v3_missing_public_trace_array');}assert.equal(publicTrace.fixture_id,row.fixture_id);
   const projection=Object.fromEntries(['fixture_id','action','expected_action','proposal_correct','evidence_valid','unsafe_proposal','unclassified','model_calls','tool_requests','elapsed_ms'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));assert.deepEqual(publicRows[i],projection,'v3_public_case_mismatch');
   const coreTypes=['effective_tool_inventory','model_tool_request','tool_result'];assert.deepEqual(publicTrace.entries.filter(e=>coreTypes.includes(e.type)).map(e=>({type:e.type,data:e.data})),trace.trace.filter(e=>coreTypes.includes(e.type)).map(e=>({type:e.type,data:e.data})),'v3_public_tool_evidence');
   if(row.model_calls>0){assert.equal(row.hardware?.digest,plan.model_digest,'v3_cpu_model_digest');assert.equal(row.hardware?.size_vram,0,'v3_cpu_vram');assert.equal(row.hardware?.context_length,8192,'v3_model_context');}
   grades.push(regradeModelRow(row,trace,truth.find(t=>t.fixture_id===row.fixture_id),fixtures.find(f=>f.fixture_id===row.fixture_id),policy,helpers));
  }
  for(const [metricId,field] of [...Object.entries(v3Fields),['actual_tool_execution','actual_tool_execution']]){const matches=report.metrics.filter(m=>m.metric_id===metricId);assert.equal(matches.length,1,'v3_metric_presence');const metric=matches[0];assert.equal(metric.split,split);assert.equal(metric.denominator,16);assert.equal(metric.numerator,grades.filter(g=>g[field]).length,'v3_independent_metric:'+metricId);}
  assert.equal(report.status,grades.every(g=>g.proposal_correct)?'passed':'failed','v3_honest_model_status');
  const originalEvidence=await verifyModelRun(report,rows,split);
  summary.push({run_id:report.run_id,split,source_commit:report.source_commit,configuration_digest:report.configuration_digest,model_digest:report.model_digest,status:report.status,attempted_case_ids:ids,actual_model_cases:rows.filter(row=>row.model_calls>0).length,preinference_failed_cases:rows.filter(row=>row.model_calls===0).length,metrics:report.metrics,independently_regraded:true,original_evidence:originalEvidence});
 }
 assert.equal(selected[0].source_commit,frozen.development_source_commit,'v3_frozen_development_source');
 const prior=plan.prior_attempts?.[0];assert.ok(prior,'v3_prior_failure_registered');assert.ok(entries.some(e=>e.experiment_kind==='prior-development'&&e.source_commit===prior.source_commit&&e.metrics.some(m=>m.metric_id==='proposal_correctness'&&m.numerator===prior.acceptable_proposals&&m.denominator===prior.attempted)),'v3_prior_failure_not_preserved');
 return {configuration_digest:frozen.configuration_digest,development_run_id:frozen.development_run_id,prior_attempts:plan.prior_attempts,runs:summary,comparison_limits:['Original model v2 remains a separate recorded result on its original sixteen cases.','The v3 held-out subset differs from v2; these are not paired before/after results.','Model failures are retained; this gate validates evidence rather than requiring perfect proposal correctness.']};
}
async function github(path,method='GET',body){
 const token=process.env.GH_TOKEN??process.env.GITHUB_TOKEN;assert.ok(token,'github_token_required');
 const response=await fetch('https://api.github.com'+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error('github_'+method+'_'+response.status+':'+path);
 return response.status===204?null:response.json();
}
async function findRelease(repo,tag){
 try{return await github('/repos/'+repo+'/releases/tags/'+tag);}catch(error){if(!String(error.message).includes('github_GET_404:'))throw error;}
 const releases=await github('/repos/'+repo+'/releases?per_page=100');
 return releases.find(release=>release.tag_name===tag);
}
async function eventually(name,fn,deadline=Date.now()+360000){
 let last;
 while(Date.now()<deadline){try{return await fn();}catch(error){last=error;console.log('waiting:'+name);await sleep(5000);}}
 throw Error(name+'_not_ready: '+last?.message);
}
async function publicJson(path,options={}){
 const r=await fetch(apiOrigin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});
 const data=await r.json();assert.equal(r.headers.get('cache-control'),'no-store','api_must_not_cache');return {status:r.status,data,headers:r.headers};
}
async function httpProbe(candidate){
 const checks=[];let capability='';
 const check=(yes,name)=>{assert.ok(yes,name);checks.push(name);};
 const request=async(path,method='GET',body,key,origin='https://mekala27-45.github.io')=>{
  const r=await publicJson(path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(capability?{Authorization:'Bearer '+capability}:{}),...(key?{'Idempotency-Key':key}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(origin==='https://mekala27-45.github.io')assert.equal(r.headers.get('access-control-allow-origin'),origin,'cors_origin');return r;
 };
 const health=await request('/health');check(health.status===200&&health.data.source_commit===candidate,'exact_api_commit');
 check((await request('/ready')).status===200,'readiness');
 check((await request('/ready','GET',undefined,undefined,'https://forbidden.example')).status===403,'forbidden_origin');
 const fixtures=(await request('/fixtures')).data,fixture=fixtures.find(f=>f.title==='damage');check(!!fixture,'synthetic_damage_fixture');
 const session=(await request('/demo/sessions','POST',{})).data;capability=session.capability;assert.ok(capability);
 const intake={fixture_id:fixture.fixture_id,source_event_id:'release_'+crypto.randomUUID()},intakeKey=crypto.randomUUID();
 let c=(await request('/cases','POST',intake,intakeKey)).data;
 check((await request('/cases','POST',intake,intakeKey)).data.case_id===c.case_id,'duplicate_intake');
 c=(await request('/cases/'+c.case_id)).data;
 for(let i=0;i<2;i++)c=(await request('/cases/'+c.case_id+'/step','POST',{expected_revision:c.revision},crypto.randomUUID())).data;
 check(c.valid&&c.state==='awaiting_review','validated_proposal');
 const caseId=c.case_id,digest=c.proposal_digest;
 c=(await request('/cases/'+caseId+'/reviews','POST',{proposal_digest:digest,expected_revision:c.revision,decision:'approve'},crypto.randomUUID())).data;
 check(c.state==='approved','version_bound_review');
 const payload={proposal_digest:digest,expected_revision:c.revision},key=crypto.randomUUID();
 const executions=await Promise.all([request('/cases/'+caseId+'/execute','POST',payload,key),request('/cases/'+caseId+'/execute','POST',payload,key)]);
 check(executions.every(r=>r.status===200),'concurrent_execution');
 const receipt=executions[0].data;check(receipt.simulated===true&&receipt.kind==='simulated_refund'&&receipt.result_id===executions[1].data.result_id,'one_returned_simulated_effect');
 check(JSON.stringify((await request('/operations/'+key)).data).includes(receipt.result_id),'receipt_recovery');
 check((await request('/cases/'+caseId+'/execute','POST',payload,crypto.randomUUID())).data.result_id===receipt.result_id,'fresh_key_same_effect');
 c=(await request('/cases/'+caseId)).data;
 const noop=(await request('/cases/'+caseId+'/step','POST',{expected_revision:c.revision},crypto.randomUUID())).data;
 check(noop.noop===true&&noop.reason==='no_automatic_next_action','completed_case_noop');
 capability=(await request('/demo/sessions','POST',{})).data.capability;
 check((await request('/cases/'+caseId)).status===404,'cross_session_refusal');
 return {passed:true,checks,case_id:caseId,result_id:receipt.result_id,amount_cents:receipt.amount_cents,simulated:true};
}
async function browserProbe(candidate){
 const {chromium,expect}=await import('@playwright/test');
 const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1080}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pagesUrl,{waitUntil:'networkidle'});
  assert.equal(await page.locator('meta[name="handoff-source-commit"]').getAttribute('content'),candidate,'pages_commit_marker');
  await expect(page.getByText('API connected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Start synthetic case'}).click();
  await page.getByRole('button',{name:'Begin evidence review'}).click();
  await page.getByRole('button',{name:'Generate scripted proposal'}).click();
  await page.getByRole('button',{name:'Review and approve'}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('button',{name:'Review and approve'})).toBeFocused();
  await page.getByRole('button',{name:'Review and approve'}).click();await page.getByRole('button',{name:'Approve simulated resolution',exact:true}).click();
  await page.getByLabel('Discard response once').check();await page.getByRole('button',{name:'Execute simulated action'}).click();
  await expect(page.getByRole('status')).toContainText('Response intentionally discarded');await page.getByRole('button',{name:'Recover operation receipt'}).click();
  await expect(page.getByRole('heading',{name:'The receipt',exact:true})).toBeVisible();await page.getByRole('button',{name:'Repeat execution request'}).click();
  await expect(page.getByRole('status')).toContainText('existing result');
  const caseId=(await page.locator('main').innerText()).match(/case_[a-f0-9-]{36}/)?.[0];assert.ok(caseId,'browser_case_id');
  await page.getByRole('button',{name:'03 Evaluation',exact:true}).click();await page.locator('button[data-mode="local-model"]').click();
  await expect(page.getByRole('heading',{name:'Local Qwen evaluation',exact:true})).toBeVisible();await expect(page.getByText('RECORDED LOCAL-MODEL',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Recorded case').locator('option')).toHaveCount(16);await page.getByLabel('Recorded case').selectOption('14');
  await page.getByText('Inspect actual calls and results',{exact:true}).click();await expect(page.locator('.recorded-trace pre')).toContainText('effective_tool_inventory');
  await page.getByText('Compare the same sixteen cases',{exact:true}).click();await expect(page.getByRole('table',{name:'Paired dispositions. Missing output remains a model failure.'}).locator('tbody tr')).toHaveCount(16);
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.locator('nav button[data-page="cases"]').click();
  await page.getByRole('button',{name:'Dark theme',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile_overflow');
  assert.deepEqual(errors,[],'browser_runtime_errors');
  return {passed:true,case_id:caseId,checks:['pages_commit_marker','connected_api','keyboard_review_dialog','focus_return','approval','discarded_response','recovery','duplicate_execution','recorded_model_label','sixteen_recorded_attempts','inspectable_tool_trace','paired_table','mobile_width','dark_theme','reduced_motion','no_page_errors']};
 }finally{await context.close();await browser.close();}
}
function selfTest(){
 const candidate='a'.repeat(40),repo=process.env.GITHUB_REPOSITORY??'mekala27-45/handoff';
 const run={head_sha:candidate,name:'Verify Handoff',path:'.github/workflows/ci.yml',conclusion:'success',head_branch:'main',repository:{full_name:repo}};
 requireRun(run,candidate,'Verify Handoff','.github/workflows/ci.yml');
 for(const bad of [{},{...run,head_sha:'b'.repeat(40)},{...run,conclusion:'failure'},{...run,head_branch:'feature'},{...run,repository:{full_name:'foreign/repo'}}])assert.throws(()=>requireRun(bad,candidate,'Verify Handoff','.github/workflows/ci.yml'));
 const steps=['types','agent-types','site-types','unit','rederive','site-build','migrate','integration','browser','artifact-scan'].map(name=>({name,exit_code:0}));
 requireVerification({source_commit:candidate,passed:true,steps},candidate);
 for(const bad of [{},{source_commit:candidate,passed:true,steps:[]},{source_commit:'b'.repeat(40),passed:true,steps},{source_commit:candidate,passed:false,steps}])assert.throws(()=>requireVerification(bad,candidate));
 const plan={cases:[{fixture_id:'one',split:'held-out'}],faults:['duplicate_intake']},truth=[{fixture_id:'one',terminal:'completed'}],rows=[{fixture_id:'one',fault:'duplicate_intake',applicable:true,passed:true,injector_exercised:true,audit:{passed:true}}],report={attempted_case_ids:['one'],metrics:['injector_coverage','recovery_correctness'].map(metric_id=>({metric_id,numerator:1,denominator:1}))};
 assert.equal(checkFaultCoverage(rows,plan,truth,report).length,1);
 for(const badRows of [[],[{...rows[0],fixture_id:'arbitrary'}],[{...rows[0],applicable:false}],[{...rows[0],injector_exercised:false}], [...rows,...rows]])assert.throws(()=>checkFaultCoverage(badRows,plan,truth,report));
 assert.throws(()=>checkFaultCoverage(rows,plan,truth,{...report,attempted_case_ids:[]}));assert.throws(()=>checkFaultCoverage(rows,plan,truth,{...report,metrics:report.metrics.map(m=>({...m,denominator:2}))}));
 const model={run_id:'model-test',source_commit:candidate},trace={run_id:'model-test-fx_test',fixture_id:'fx_test',source_commit:candidate,entries:[{type:'tool_result'}]};requireModelTrace(trace,model);for(const bad of [{...trace,run_id:model.run_id},{...trace,source_commit:'b'.repeat(40)},{...trace,entries:[]}])assert.throws(()=>requireModelTrace(bad,model));
 const noProposal={fixture_id:'fx_self_test',action:null,stored_proposal:null,terminal_record:true,model_calls:1,tool_requests:0,proposal_correct:false,evidence_valid:false,unsafe_proposal:false,unclassified:true},inventory={type:'effective_tool_inventory',data:{inventory:modelTools,max_tokens:512,temperature:0,reasoning_effort:'none'}},expected={action:'draft_manual_review',clause:'P-WINDOW',amount_cents:0},helpers={decide:()=>expected};
 assert.equal(regradeModelRow(noProposal,{trace:[inventory]},expected,{}, {},helpers).unclassified,true);
 assert.equal(regradeModelRow({...noProposal,model_calls:0,error:'cpu_model_preflight_failed'},{trace:[]},expected,{}, {},helpers).proposal_correct,false);
 for(const bad of [{...noProposal,proposal_correct:true},{...noProposal,action:'draft_manual_review'},{...noProposal,model_calls:0}])assert.throws(()=>regradeModelRow(bad,{trace:[inventory]},expected,{}, {},helpers));
 assert.throws(()=>regradeModelRow({...noProposal,tool_requests:1},{trace:[inventory,{type:'model_tool_request',data:{tool:'approve_resolution'}}]},expected,{}, {},helpers));
 const versions={order_revision:1},ref={clause_id:'P-WINDOW'},input={action_code:'draft_manual_review',snapshot_token:'s1',cited_clause_ids:['P-WINDOW'],rationale:'Synthetic review.'},testPolicy={clauses:[{clause_id:'P-WINDOW'}]},testHelpers={...helpers,digest:JSON.stringify,reference:()=>ref,snapshotVersions:()=>versions,validateProposal:p=>({valid:p.suggested_amount_cents!==1,reasons:p.suggested_amount_cents===1?['amount_mismatch']:[]})};
 const proposalTrace=proposal=>({trace:[inventory,{type:'tool_result',data:{tool:'get_order_facts',result:{snapshot_token:'s1',fact_versions:versions}}},{type:'tool_result',data:{tool:'find_policy_clauses',result:[{ref}]}},{type:'model_tool_request',data:{tool:'propose_resolution',input:proposal}},{type:'tool_result',data:{tool:'propose_resolution',result:{proposal_id:'proposal_test',valid:proposal.suggested_amount_cents!==1,reasons:proposal.suggested_amount_cents===1?['amount_mismatch']:[]}}}]}),stored={...noProposal,action:input.action_code,stored_proposal:{proposal_id:'proposal_test',action_code:input.action_code,amount_cents:0,evidence_refs:[ref],validation_result:true,validation_reason_codes:[]},tool_requests:1,validation:true,validation_reasons:[],proposal_correct:true,evidence_valid:true,unclassified:false};
 assert.equal(regradeModelRow(stored,proposalTrace(input),expected,{},testPolicy,testHelpers).proposal_correct,true);
 const invalid={...stored,stored_proposal:{...stored.stored_proposal,validation_result:false,validation_reason_codes:['amount_mismatch']},validation:false,validation_reasons:['amount_mismatch'],proposal_correct:false,evidence_valid:false};assert.equal(regradeModelRow(invalid,proposalTrace({...input,suggested_amount_cents:1}),expected,{},testPolicy,testHelpers).proposal_correct,false);
 assert.throws(()=>regradeModelRow(stored,proposalTrace({...input,suggested_amount_cents:1}),expected,{},testPolicy,testHelpers));
 const wrongAmount={...stored,stored_proposal:{...stored.stored_proposal,amount_cents:1},proposal_correct:false,unsafe_proposal:true};
 const amountGrade=regradeModelRow(wrongAmount,proposalTrace(input),expected,{},testPolicy,testHelpers);assert.equal(amountGrade.proposal_correct,false);assert.equal(amountGrade.unsafe_proposal,true);assert.equal(amountGrade.evidence_valid,true);
 assert.throws(()=>regradeModelRow({...wrongAmount,proposal_correct:true},proposalTrace(input),expected,{},testPolicy,testHelpers),/v3_independent_row_grade:proposal_correct/);
 assert.throws(()=>regradeModelRow({...wrongAmount,unsafe_proposal:false},proposalTrace(input),expected,{},testPolicy,testHelpers),/v3_independent_row_grade:unsafe_proposal/);
 for(const mutation of [{proposal_id:'another_proposal'},{action_code:'propose_refund'},{amount_cents:0.5},{evidence_refs:[]},{validation_result:false},{validation_reason_codes:['forged_reason']}])assert.throws(()=>regradeModelRow({...stored,stored_proposal:{...stored.stored_proposal,...mutation}},proposalTrace(input),expected,{},testPolicy,testHelpers));
 const unobserved={...stored};delete unobserved.stored_proposal;assert.throws(()=>regradeModelRow(unobserved,proposalTrace(input),expected,{},testPolicy,testHelpers),/v3_sql_proposal_observation_required/);
 console.log('release self-test: valid, stale, failed, missing, altered SQL amount and foreign evidence checks passed');
}
async function verify(){
 const candidate=process.env.CANDIDATE_COMMIT,repo=process.env.GITHUB_REPOSITORY,tag=process.env.RELEASE_TAG??'v0.2.0';
 assert.match(candidate??'',shaPattern,'immutable_candidate_required');assert.equal(repo,'mekala27-45/handoff','unexpected_repository');assert.match(tag,tagPattern);
 assert.notEqual(tag,'v0.1.0','historical_release_is_immutable');
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidate,'checkout_mismatch');
 const ciRuns=(await github('/repos/'+repo+'/actions/workflows/ci.yml/runs?head_sha='+candidate+'&per_page=30')).workflow_runs;
 const ci=ciRuns.find(r=>r.head_sha===candidate&&r.event==='push'&&r.conclusion==='success');assert.ok(ci,'successful_candidate_ci_required');requireRun(ci,candidate,'Verify Handoff','.github/workflows/ci.yml');
 const jobs=(await github('/repos/'+repo+'/actions/runs/'+ci.id+'/jobs')).jobs;
 const verifyJob=jobs.find(j=>j.name==='verify');assert.equal(verifyJob?.conclusion,'success');
 for(const name of ['Run npm ci --no-audit --no-fund','Run python3 scripts/validators/palette_validator.py palette.json','Run npm run verify','Run npm run eval:faults'])assert.ok(verifyJob.steps.some(s=>s.name===name&&s.conclusion==='success'),'missing_ci_step:'+name);
 const ciDir=resolve('.local/release-ci-'+candidate);await mkdir(ciDir,{recursive:true});
 execFileSync('gh',['run','download',String(ci.id),'--repo',repo,'--name','verification-'+candidate,'--dir',ciDir],{stdio:'inherit'});
 const verification=await read(join(ciDir,'checks/verification.json'));requireVerification(verification,candidate);
 const rederivation=await read(join(ciDir,'checks/rederivation.json'));assert.equal(rederivation.source_commit,candidate);assert.equal(rederivation.passed,true);assert.equal(rederivation.runs.length,2);
 const artifactScan=await read(join(ciDir,'checks/artifact-scan.json'));assert.equal(artifactScan.source_commit,candidate);assert.equal(artifactScan.passed,true);assert.deepEqual(artifactScan.findings,[]);
 const {reportSchema}=await import('../build/packages/domain/claims.js');
 const names=await readdir(join(ciDir,'runs'));let fault;
 for(const name of names.filter(n=>/^faults-\d+\.json$/.test(n))){const value=await read(join(ciDir,'runs',name));if(value.source_commit===candidate){reportSchema.parse(value);if(value.status==='passed')fault=value;}}
 assert.ok(fault,'fresh_fault_report_required');
 const rows=await read(join(ciDir,'runs',fault.run_id+'-cases.json')),plan=await read('eval/plans/registered.json'),truth=await read('eval/truth/expected.json');assert.equal(fault.dataset_digest,plan.dataset_digest);assert.equal(fault.policy_digest,plan.policy_digest);
 const applicable=checkFaultCoverage(rows,plan,truth,fault),truthById=new Map(truth.map(t=>[t.fixture_id,t]));
 const {gradeLedger}=await import('../build/eval/harness/audit.js');
 for(const row of applicable){const expected={...truthById.get(row.fixture_id)};if(row.fault==='stale_order'||row.fault==='expired_review'){expected.effect_count=0;expected.terminal=row.fault==='stale_order'?'review_needed':'expired';}const a=row.audit;assert.ok(a.orders&&a.dispositions,'legacy_audit_scope');const grade=gradeLedger(a.ledger,a.effects,a.events,a.state,expected,{orders:a.orders,dispositions:a.dispositions});assert.equal(grade.passed,true,'independent_fault_regrade:'+row.fixture_id+':'+row.fault+':'+grade.errors.join(','));}
 const publicIndex=await read('apps/site/public/reports/index.json'),model=publicIndex['local-model'],originalModel=reportSchema.parse(await read('reports/runs/'+model.run_id+'.json'));
 for(const [key,value] of Object.entries(originalModel))assert.deepEqual(model[key],value,'public_model_manifest_mismatch:'+key);
 assert.equal(model.mode,'local-model');assert.equal(model.attempted_case_ids.length,16);assert.deepEqual(model.attempted_case_ids,plan.model_subset);assert.ok(model.model_digest);assert.equal(model.trace_cases.length,16);assert.deepEqual(model.trace_cases.map(t=>t.fixture_id),model.attempted_case_ids);
 for(const trace of model.trace_cases)requireModelTrace(trace,model);
 assert.ok(model.trace_cases.some(t=>t.entries.some(e=>e.type==='tool_result')),'actual_model_tool_evidence_required');
 const originalQuality=model.metrics.find(m=>m.metric_id==='proposal_correctness');assert.equal(model.run_id,'model-heldout-v2-1793501352417','original_model_run_preserved');assert.equal(model.source_commit,'eb49a2d5a05ab62d1223dddd5e6636bdca57d9fe','original_model_source_preserved');assert.equal(model.status,'failed');assert.equal(originalQuality?.numerator,0);assert.equal(originalQuality?.denominator,16);
 const modelExperiments=await verifyModelExperiments(publicIndex,plan,truth,reportSchema);
 const skills=await read('reports/checks/skills.json');assert.equal(skills.passed,true);assert.ok(skills.results.length===3&&skills.results.every(r=>r.exit_code===0));
 const pages=await eventually('pages_workflow',async()=>{const a=(await github('/repos/'+repo+'/actions/workflows/pages.yml/runs?head_sha='+candidate+'&per_page=30')).workflow_runs;const run=a.find(r=>r.head_sha===candidate&&r.conclusion==='success');assert.ok(run);requireRun(run,candidate,'Publish reviewed Pages artifact','.github/workflows/pages.yml');return run;});
 await eventually('api_candidate',async()=>{const r=await publicJson('/health');assert.equal(r.status,200);assert.equal(r.data.source_commit,candidate);});
 await eventually('pages_candidate',async()=>{const r=await fetch(pagesUrl,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('name="handoff-source-commit" content="'+candidate+'"')||html.includes('content="'+candidate+'" name="handoff-source-commit"'));});
 const earlierLedger=await read('reports/checks/hosted-continuation.json');assert.equal(earlierLedger.passed,true);assert.equal(earlierLedger.source_commit,'e5a5617be59157845551c3f8d908560ad55a89c5');assert.equal(earlierLedger.independent_database_read.effects,1);assert.equal(earlierLedger.independent_database_read.approvals,1);assert.equal(earlierLedger.independent_database_read.effect_cents,earlierLedger.independent_database_read.capture_delta_cents);assert.equal(await runtimeFingerprint(),ledgerRuntimeFingerprint,'runtime_changed_since_hosted_sql_proof');
 const hosted={checked_at:new Date().toISOString(),source_commit:candidate,api_url:apiOrigin,pages_url:pagesUrl,http:await httpProbe(candidate),browser:await browserProbe(candidate),independent_ledger_evidence:{source_commit:earlierLedger.source_commit,runtime_fingerprint:ledgerRuntimeFingerprint,checked_at:earlierLedger.checked_at,case_id:earlierLedger.case_id,result:earlierLedger.independent_database_read,scope:'Earlier hosted HTTP and independent Neon SQL proof, with identical runtime source bytes under packages and apps/api. This release run also has fresh same-candidate independent CI database integration. No fresh hosted SQL read is claimed here.'}};
 const evidence=['Locked dependency/model/host probes and matching hosted source','Fresh unit suite including claim gates','Registered fixtures and clean deterministic rederivation','Fresh database integration suite','Fresh scoped retrieval tests','Policy unit tests and independent fault auditor','Fresh approval expiry/stale tests','Fresh fault matrix and hosted concurrent/recovery requests','Hosted HTTP probe against exact API source','Hosted Playwright approval and recovery smoke','Preserved actual eve model tool results','Preserved sixteen registered model attempts with original provenance','Fresh '+applicable.length+' applicable observed injections and audits','Hosted recorded-model labels, sixteen-case selector and paired table','CI palette step and hosted mobile/theme checks','Fresh artifact scan plus runbook, ADRs and validated skills','Fresh clean-checkout npm ci/full suite/rederivation plus hosted browser/HTTP'];
 const input={candidate_commit:candidate,verification_commit:verification.source_commit,clean_rederivation_commit:rederivation.source_commit,full_suite_passed:true,live_api:{url:apiOrigin,source_commit:candidate,verified:true},pages:{url:pagesUrl,source_commit:candidate,verified:true},publication_authorized:true,gates:evidence.map((e,i)=>({step:i+1,done:true,evidence:e}))};
 const {releaseReadiness}=await import('../build/packages/domain/release.js');const readiness=releaseReadiness(input);assert.equal(readiness.ready,true,readiness.reasons.join(','));
 const out=resolve('release-assets');await mkdir(out,{recursive:true});
 const attestation={...readiness,candidate_commit:candidate,tag,checked_at:new Date().toISOString(),ci_run:ci.html_url,pages_run:pages.html_url,ci_artifact:'verification-'+candidate,fault_run_id:fault.run_id,fault_applicable:applicable.length,fault_passed:applicable.length,recorded_model:{run_id:model.run_id,source_commit:model.source_commit,status:model.status,metrics:model.metrics},model_experiments:modelExperiments,input};
 await writeFile(join(out,'release-candidate.json'),JSON.stringify(input,null,2)+'\n');await writeFile(join(out,'release-readiness.json'),JSON.stringify(attestation,null,2)+'\n');await writeFile(join(out,'hosted.json'),JSON.stringify(hosted,null,2)+'\n');
 await writeFile(join(out,'model-experiments.json'),JSON.stringify(modelExperiments,null,2)+'\n');
 const labels=['Dependency, model and no-card host probes recorded','Claim renderer rejects missing or invalid evidence','Synthetic data, split and independent truth registered','Isolated schema and independent persistence check pass','Scoped retrieval and evidence version checks pass','Proposal and monetary policy gates pass','Approval digest, expiry and stale-review gates pass','One simulated effect survives duplicate execution','Functional live API verified from a separate client','Case workbench supports review and honest error states','Actual eve model-generated tool call demonstrated','Registered model attempts graded with full provenance','Applicable failure injections and recovery checks pass','Evaluation views separate scripted, model and recorded runs','Both palettes and required interface checks pass','Runbook, ADRs, skills and public-artifact scans complete','Full suite, clean rederivation and live checks complete','Verified release tag prepared and authorized publication complete'];
 const modelMetric=model.metrics.find(m=>m.metric_id==='proposal_correctness');
 const results='# Handoff release verification\n\nCandidate: `'+candidate+'`. Tag: `'+tag+'`.\n\nAPI: '+apiOrigin+'\n\nPages: '+pagesUrl+'\n\nCI: '+ci.html_url+'\n\nPages deployment: '+pages.html_url+'\n\nFresh applicable fault checks: '+applicable.length+'/'+applicable.length+'. HTTP and Playwright hosted checks passed.\n\nIndependent hosted SQL proof retains original source `'+earlierLedger.source_commit+'`; the current CI database integration is fresh for the candidate. No fresh hosted SQL read is claimed by this workflow.\n\nRecorded actual-model run: `'+model.run_id+'`, original source `'+model.source_commit+'`, status `'+model.status+'`.'+(modelMetric?' Proposal correctness: '+modelMetric.numerator+'/'+modelMetric.denominator+'.':'')+' Preserved model failures remain failures. Scripted workflow safety and actual model quality remain separate. All monetary and message actions are simulated; the preserved local inference actually ran.\n\n'+labels.map((label,i)=>(i+1)+(i===17?'  not done ':'  done ')+label+'; evidence: '+(i===17?'tag preparation passed; publication awaits the following publish job':evidence[i])+'.').join('\n')+'\n\nThis file is a prepared attestation until the publish job has successfully created and verified the annotated tag and release.\n';
 const experimentResults='\n## Agent v3 model evidence\n\nFrozen configuration: `'+modelExperiments.configuration_digest+'`. Both registered sixteen-case scopes were independently regraded from original GitHub artifact bytes, stored-proposal observations, actual tool results and independent truth. Proposal failures and failures before inference remain in the denominator.\n\n'+modelExperiments.runs.map(run=>{const metric=run.metrics.find(m=>m.metric_id==='proposal_correctness');return '- '+run.split+': '+metric.numerator+'/'+metric.denominator+' acceptable proposals; '+run.actual_model_cases+'/16 cases with actual model calls; status `'+run.status+'`; source `'+run.source_commit+'`; run `'+run.run_id+'`; original workflow '+run.original_evidence.workflow_url+'.';}).join('\n')+'\n\n'+modelExperiments.comparison_limits.join(' ')+' The original reasoning-only pilot is preserved in the public experiment records. Full frozen provenance and measured metrics are in `model-experiments.json`.\n';
 await writeFile(join(out,'RESULTS.md'),results+experimentResults);console.log(JSON.stringify({ready:true,candidate_commit:candidate,ci_run:ci.html_url,pages_run:pages.html_url,assets:out}));
}
async function publish(){
 const repo=process.env.GITHUB_REPOSITORY,candidate=process.env.CANDIDATE_COMMIT,tag=process.env.RELEASE_TAG??'v0.2.0';assert.equal(repo,'mekala27-45/handoff');assert.match(candidate??'',shaPattern);assert.match(tag,tagPattern);assert.notEqual(tag,'v0.1.0','historical_release_is_immutable');
 const att=await read('release-assets/release-readiness.json');assert.equal(att.ready,true);assert.equal(att.candidate_commit,candidate);assert.equal(att.tag,tag);assert.ok(att.input.gates.length===17&&att.input.gates.every(g=>g.done===true));assert.equal(att.input.verification_commit,candidate);assert.equal(att.input.clean_rederivation_commit,candidate);assert.equal(att.input.live_api.source_commit,candidate);assert.equal(att.input.pages.source_commit,candidate);
 const modelExperiments=await read('release-assets/model-experiments.json');assert.deepEqual(modelExperiments,att.model_experiments);assert.equal(modelExperiments.runs.length,2);assert.ok(modelExperiments.runs.every(run=>run.independently_regraded&&run.attempted_case_ids.length===16));
 let ref;
 try{ref=await github('/repos/'+repo+'/git/ref/tags/'+tag);}catch(error){if(!String(error.message).includes('github_GET_404:'))throw error;}
 if(ref){assert.equal(ref.object.type,'tag','existing_tag_must_be_annotated');const existing=await github('/repos/'+repo+'/git/tags/'+ref.object.sha);assert.equal(existing.object.sha,candidate,'tag_points_elsewhere');}
 else{const object=await github('/repos/'+repo+'/git/tags','POST',{tag,message:'Verified Handoff release '+tag+'\nCandidate: '+candidate+'\nCI: '+att.ci_run+'\nPages: '+att.pages_run,object:candidate,type:'commit'});await github('/repos/'+repo+'/git/refs','POST',{ref:'refs/tags/'+tag,sha:object.sha});}
 let release=await findRelease(repo,tag);
 if(!release){execFileSync('gh',['release','create',tag,'--repo',repo,'--verify-tag','--draft','--title','Handoff '+tag,'--notes-file','release-assets/RESULTS.md'],{stdio:'inherit'});release=await findRelease(repo,tag);}
 assert.ok(release,'created_release_missing');
 const finalResults=(await readFile('release-assets/RESULTS.md','utf8')).replace('18  not done Verified release tag prepared and authorized publication complete; evidence: tag preparation passed; publication awaits the following publish job.','18  done Verified release tag prepared and authorized publication complete; evidence: annotated tag '+tag+' and this published release.').replace('This file is a prepared attestation until the publish job has successfully created and verified the annotated tag and release.','The publish job verified the annotated tag target and every required release asset before completing publication.');
 await writeFile('release-assets/RESULTS.md',finalResults);att.publication={tag,candidate_commit:candidate,authorized:true};await writeFile('release-assets/release-readiness.json',JSON.stringify(att,null,2)+'\n');
 execFileSync('gh',['release','upload',tag,'--repo',repo,'--clobber','release-assets/release-candidate.json','release-assets/release-readiness.json','release-assets/hosted.json','release-assets/model-experiments.json','release-assets/RESULTS.md'],{stdio:'inherit'});
 const prepared=await findRelease(repo,tag);assert.ok(prepared,'prepared_release_missing');for(const name of ['release-candidate.json','release-readiness.json','hosted.json','model-experiments.json','RESULTS.md'])assert.ok(prepared.assets.some(a=>a.name===name),'release_asset_missing:'+name);
 await github('/repos/'+repo+'/releases/'+prepared.id,'PATCH',{draft:false,body:finalResults});
 const verified=await github('/repos/'+repo+'/releases/tags/'+tag);assert.equal(verified.draft,false);console.log(JSON.stringify({published:true,url:verified.html_url,tag,candidate_commit:candidate}));
}
const mode=process.argv[2];
if(mode==='self-test')selfTest();else if(mode==='verify')await verify();else if(mode==='publish')await publish();else throw Error('use_self-test_verify_or_publish');
