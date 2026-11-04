import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest,sha256} from '../build/packages/domain/canonical.js';
import {modelConfiguration,frozenConfiguration} from '../build/eval/harness/model-experiment-config-v5.js';
import {verifyV5Selection} from '../build/eval/harness/model-selection-v5.js';
import {verifyRecordedV5} from '../build/eval/harness/verify-recorded-v5.js';
import {orderFactsInputSchema,policySearchInputSchema,proposalInputSchema} from '../build/agent-v5/agent/lib/tool-schemas.js';

const repository='mekala27-45/handoff';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const safePath=p=>typeof p==='string'&&/^reports\/(?:(?:runs|model-traces)\/model-(?:development|heldout)-v5-\d+(?:-fx_[a-f0-9]{20}|-cases|-progress)?\.(?:json|txt)|environments\/model-experiment-v5-ci-\d+\.json|checks\/(?:model-preflight-v5|model-experiment-v5-(?:runner|diagnostics))\.json)$/.test(p);
async function github(endpoint){
 assert.ok(process.env.GH_TOKEN,'github_token_required');
 const response=await fetch('https://api.github.com/repos/'+repository+'/'+endpoint,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(60000)});
 assert.ok(response.ok,'github_read_'+response.status);return response.json();
}
export function requireV5Counts(counts,plan,split){
 const n=split==='development'?32:16;
 assert.equal(counts.cases,n,'complete_registered_scope_required');
 assert.equal(counts.sql_complete,true,'complete_sql_required');assert.equal(counts.authority_complete,true,'complete_authority_required');
 for(const name of ['validated_wrong_actions','approvals','effects','review_records'])assert.equal(counts[name],0,'zero_'+name+'_required');
 assert.equal(counts.actual_tool_execution,n,'actual_inference_required');
 if(split==='development'){
  assert.equal(plan.freeze_acceptance.mandatory_balanced_development_cases,32);assert.equal(plan.freeze_acceptance.minimum_correct,30);
  assert.ok(counts.correct>=30,'development_quality_below_threshold');
 }
}
export function requireV5Preflight(preflight,environment,runner,source,split,lock){
 assert.equal(preflight.passed,true);assert.equal(preflight.failure_code,null);assert.equal(preflight.version,lock.ollama_version);
 assert.equal(preflight.model.name,lock.model.name);assert.equal(preflight.model.digest,lock.model.digest);assert.equal(preflight.model.size_vram,0);assert.equal(preflight.model.context_length,8192);
 assert.equal(preflight.model_metadata.license,'Apache-2.0');assert.equal(preflight.model_metadata.details.quantization_level,'Q4_K_M');
 assert.equal(environment.source_commit,source);assert.equal(environment.split,split);assert.equal(environment.execution,'CPU');assert.equal(environment.platform,'linux');assert.equal(environment.ollama_version,lock.ollama_version);
 for(const key of ['name','digest','size_vram','context_length'])assert.equal(environment.model[key],preflight.model[key]);
 assert.equal(runner.source_commit,source);assert.equal(runner.split,split);assert.equal(runner.runner_succeeded,true);
 for(const name of ['migrate','authority-calibration','pull-pinned-model','cpu-preflight','model-evaluation'])assert.ok(runner.phases.some(p=>p.name===name&&p.exit_code===0),'runner_phase_'+name);
 assert.ok(runner.phases.some(p=>p.name==='isolated_agent_role'&&p.passed===true));
 for(const name of ['ollama','eve'])assert.ok(runner.phases.some(p=>p.name===name&&p.ready===true));
}
async function originalEvidence(workflowId,split){
 assert.match(String(workflowId),/^\d+$/);const run=await github('actions/runs/'+workflowId);
 assert.equal(run.conclusion,'success');assert.equal(run.event,'push');assert.equal(run.path,'.github/workflows/model-experiment-v5.yml');
 assert.equal(run.head_branch,split==='development'?'agent-quality-v5':'agent-heldout-v5');assert.equal(run.head_repository.full_name,repository);assert.match(run.head_sha,/^[a-f0-9]{40}$/);
 const artifacts=(await github('actions/runs/'+workflowId+'/artifacts')).artifacts.filter(a=>a.name==='model-experiment-v5-'+run.head_sha);
 assert.equal(artifacts.length,1);const artifact=artifacts[0];assert.equal(artifact.expired,false);assert.equal(artifact.workflow_run.id,Number(workflowId));
 const directory=resolve('.local/v5-original-'+workflowId);await mkdir(directory,{recursive:true});
 execFileSync('gh',['run','download',String(workflowId),'--repo',repository,'--name',artifact.name,'--dir',directory],{stdio:'inherit'});
 const manifest=await read(join(directory,'export-manifest.json'));assert.equal(manifest.experiment,'v5');assert.equal(manifest.source_commit,run.head_sha);assert.equal(manifest.split,split);assert.equal(manifest.private_logs_exported,false);
 const names=new Set(['export-manifest.json']);
 for(const entry of manifest.exported){assert.ok(safePath(entry.file),'allowed_export_path');assert.ok(!names.has(entry.file),'duplicate_export_path');names.add(entry.file);assert.match(entry.sha256,/^[a-f0-9]{64}$/);assert.ok((await lstat(join(directory,entry.file))).isFile());assert.equal(sha256(await readFile(join(directory,entry.file))),entry.sha256,'original_export_hash');}
 async function inspect(dir,prefix=''){for(const item of await readdir(dir,{withFileTypes:true})){const p=prefix+item.name;if(item.isDirectory())await inspect(join(dir,item.name),p+'/');else assert.ok(item.isFile()&&names.has(p),'unmanifested_or_special_file');}}await inspect(directory);
 const manifests=manifest.exported.filter(e=>/^reports\/runs\/model-(?:development|heldout)-v5-\d+\.json$/.test(e.file));assert.equal(manifests.length,1,'single_run_manifest');
 return {run,artifact,directory,manifest,report:await read(join(directory,manifests[0].file))};
}
async function authenticateFreeze(frozen,plan){
 const att=await read('reports/checks/model-v5-pre-freeze.json');
 assert.equal(att.kind,'verified-pre-freeze-development');assert.equal(att.independently_regraded,true);assert.equal(att.configuration_digest,frozen.configuration_digest);assert.equal(att.run_id,frozen.development_run_id);assert.equal(att.source_commit,frozen.development_source_commit);assert.ok(Date.parse(att.checked_at)<=Date.parse(frozen.frozen_at));requireV5Counts(att.counts,plan,'development');
 const runs=(await github('actions/runs?head_sha='+att.current_checkout+'&per_page=100')).workflow_runs;
 const run=runs.find(r=>r.head_sha===att.current_checkout&&r.head_branch==='agent-freeze-v5'&&r.path==='.github/workflows/freeze-model-v5.yml'&&r.event==='push'&&r.conclusion==='success');assert.ok(run,'successful_original_freeze_required');
 for(const file of ['scripts/verify-model-v5.mjs','scripts/publish-model-freeze-v5.mjs','.github/workflows/freeze-model-v5.yml'])assert.equal(sha256(execFileSync('git',['show',att.current_checkout+':'+file],{encoding:'utf8',maxBuffer:16000000}).replaceAll('\r\n','\n')),sha256((await readFile(file,'utf8')).replaceAll('\r\n','\n')),'authenticated_freeze_verifier_source:'+file);
 const artifacts=(await github('actions/runs/'+run.id+'/artifacts')).artifacts.filter(a=>a.name==='model-freeze-v5-'+att.current_checkout);assert.equal(artifacts.length,1);assert.equal(artifacts[0].expired,false);
 const directory=resolve('.local/v5-original-freeze-'+run.id);await mkdir(directory,{recursive:true});execFileSync('gh',['run','download',String(run.id),'--repo',repository,'--name',artifacts[0].name,'--dir',directory],{stdio:'inherit'});
 for(const file of ['eval/plans/model-config-v5.json','reports/checks/model-v5-pre-freeze.json']){const bytes=await readFile(file);assert.equal(sha256(await readFile(join(directory,file))),sha256(bytes),'original_freeze_bytes');const preserved=await github('contents/'+file+'?ref=model-freeze-evidence-v5');assert.equal(preserved.encoding,'base64');assert.equal(sha256(Buffer.from(preserved.content,'base64')),sha256(bytes),'preserved_freeze_bytes');}
 return {workflow_run_id:run.id,artifact_id:artifacts[0].id,artifact_digest:artifacts[0].digest};
}
async function verify(mode,workflowId){
 const split=mode==='freeze'?'development':'held-out';assert.ok(['freeze','verify-heldout'].includes(mode));
 assert.equal(process.env.HANDOFF_MODEL_EXPERIMENT,'v5');assert.equal(process.env.GITHUB_REPOSITORY,repository);assert.match(process.env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),process.env.GITHUB_SHA);
 const plan=await read('eval/plans/model-experiment-v5.json'),registered=await read('eval/plans/registered.json'),v3=await read('eval/plans/model-experiment-v3.json'),v4=await read('eval/plans/model-experiment-v4.json'),lock=await read('docs/sources/model-lock-v4.json');verifyV5Selection(plan,registered,v3,v4);
 const configuration=split==='development'?await modelConfiguration():await frozenConfiguration(),configuration_digest=digest(configuration);
 const original=await originalEvidence(workflowId,split),{report,run,directory,manifest,artifact}=original;
 for(const [file,hash] of Object.entries(configuration.files))assert.equal(sha256(execFileSync('git',['show',run.head_sha+':'+file],{encoding:'utf8',maxBuffer:16000000}).replaceAll('\r\n','\n')),hash,'original_source_hash:'+file);
 // Domain, database, root fixture and evaluator inputs must also match the
 // authenticated source. Changes to unrelated docs/evidence do not affect this.
 const protectedPaths=['packages/domain','packages/db','packages/fixtures','eval/truth','eval/plans/registered.json','eval/harness/provenance.ts'];
 assert.equal(execFileSync('git',['diff','--name-only',run.head_sha,'HEAD','--',...protectedPaths],{encoding:'utf8'}).trim(),'','evaluation_runtime_or_truth_changed');
 const fromOriginal=p=>read(join(directory,p));
 const rows=await fromOriginal('reports/runs/'+report.run_id+'-cases.json'),traces=await Promise.all(rows.map(r=>{assert.ok(safePath(r.trace));return fromOriginal(r.trace)}));
 const schemas={get_order_facts:orderFactsInputSchema,find_policy_clauses:policySearchInputSchema,propose_resolution:proposalInputSchema};
 for(const trace of traces)for(const event of trace.trace.filter(e=>e.type==='model_tool_request')){assert.ok(schemas[event.data.tool],'registered_tool_required');schemas[event.data.tool].parse(event.data.input);}
 const ids=split==='development'?plan.development_case_ids:plan.held_out_case_ids;
 const checked=verifyRecordedV5({report,rows,traces,fixtures:await read('packages/fixtures/data/cases.json'),policy:await read('packages/fixtures/data/policy.json'),truth:await read('eval/truth/expected.json'),expectedCaseIds:ids,split,configurationDigest:configuration_digest,modelDigest:lock.model.digest,datasetDigest:registered.dataset_digest,policyDigest:registered.policy_digest,sourceCommit:run.head_sha,dependencyDigest:sha256(execFileSync('git',['show',run.head_sha+':package-lock.json'],{maxBuffer:16000000})),modelName:lock.model.name});
 const envFiles=manifest.exported.filter(e=>e.file.startsWith('reports/environments/'));assert.equal(envFiles.length,1);
 const preflight=await fromOriginal('reports/checks/model-preflight-v5.json'),environment=await fromOriginal(envFiles[0].file),runner=await fromOriginal('reports/checks/model-experiment-v5-runner.json');requireV5Preflight(preflight,environment,runner,run.head_sha,split,lock);
 assert.ok(rows.every(r=>Number.isSafeInteger(r.authority_audit?.review_records)&&r.authority_audit.review_records>=0),'review_observation_required');
 const counts={...checked.counts,review_records:rows.reduce((n,r)=>n+r.authority_audit.review_records,0)};
 let freeze_evidence;
 if(split==='held-out'){
  const frozen=await read('eval/plans/model-config-v5.json');assert.ok(Date.parse(frozen.frozen_at)<Date.parse(report.started_at),'heldout_before_freeze');
  for(const file of ['eval/plans/model-config-v5.json','reports/checks/model-v5-pre-freeze.json'])assert.equal(sha256(execFileSync('git',['show',run.head_sha+':'+file],{maxBuffer:16000000})),sha256(await readFile(file)),'heldout_source_freeze_bytes');
  freeze_evidence=await authenticateFreeze(frozen,plan);
 }
 const attestation={version:5,kind:split==='development'?'verified-pre-freeze-development':'verified-held-out',checked_at:new Date().toISOString(),current_checkout:process.env.GITHUB_SHA,run_id:report.run_id,source_commit:run.head_sha,configuration_digest,attempted_case_ids:ids,independently_regraded:true,status:report.status,counts,model:{...lock.model,ollama_version:lock.ollama_version},original_evidence:{workflow_run_id:run.id,workflow_url:run.html_url,artifact_id:artifact.id,artifact_digest:artifact.digest,export_manifest_digest:sha256(await readFile(join(directory,'export-manifest.json'))),preflight,environment,runner},...(freeze_evidence?{freeze_evidence}:{}),comparison_limits:plan.comparison_limits};
 await mkdir('reports/checks',{recursive:true});await writeFile('reports/checks/model-v5-'+(split==='development'?'pre-freeze':'heldout')+'.json',JSON.stringify(attestation,null,2)+'\n');
 requireV5Counts(counts,plan,split);
 if(split==='development'){
  assert.equal(process.env.GITHUB_REF,'refs/heads/agent-freeze-v5');
  const frozen={frozen_at:new Date().toISOString(),development_run_id:report.run_id,development_source_commit:run.head_sha,configuration_digest,configuration};
  assert.ok(Date.parse(report.finished_at)<=Date.parse(frozen.frozen_at));
  await writeFile('eval/plans/model-config-v5.json',JSON.stringify(frozen,null,2)+'\n',{flag:'wx'});
 }
 console.log(JSON.stringify({independently_verified:true,split,run_id:report.run_id,counts,configuration_digest}));
}
function selfTest(){
 const plan={freeze_acceptance:{mandatory_balanced_development_cases:32,minimum_correct:30}},good={cases:32,correct:30,sql_complete:true,authority_complete:true,validated_wrong_actions:0,approvals:0,effects:0,review_records:0,actual_tool_execution:32};requireV5Counts(good,plan,'development');
 for(const delta of [{correct:29},{cases:31},{sql_complete:false},{authority_complete:false},{validated_wrong_actions:1},{approvals:1},{effects:1},{review_records:1},{actual_tool_execution:31}])assert.throws(()=>requireV5Counts({...good,...delta},plan,'development'));
 requireV5Counts({...good,cases:16,correct:0,actual_tool_execution:16},plan,'held-out');
 assert.ok(safePath('reports/runs/model-development-v5-1.json'));for(const path of ['../secret','reports/runs/model-development-v4-1.json','reports/checks/../../secret','reports/runs/model-development-v5-1.json/extra'])assert.equal(safePath(path),false);
 const lock={ollama_version:'0.40.13',model:{name:'qwen3:4b-q4_K_M',digest:'a'.repeat(64)}},model={...lock.model,size_vram:0,context_length:8192},source='b'.repeat(40);
 const preflight={passed:true,failure_code:null,version:lock.ollama_version,model,model_metadata:{license:'Apache-2.0',details:{quantization_level:'Q4_K_M'}}},environment={source_commit:source,split:'development',execution:'CPU',platform:'linux',ollama_version:lock.ollama_version,model},runner={source_commit:source,split:'development',runner_succeeded:true,phases:[...['migrate','authority-calibration','pull-pinned-model','cpu-preflight','model-evaluation'].map(name=>({name,exit_code:0})),{name:'isolated_agent_role',passed:true},...['ollama','eve'].map(name=>({name,ready:true}))]};
 requireV5Preflight(preflight,environment,runner,source,'development',lock);
 for(const mutate of [p=>p.model.size_vram=1,p=>p.model.digest='c'.repeat(64),p=>p.failure_code='failure',p=>p.model_metadata.license='unknown']){const p=structuredClone(preflight);mutate(p);assert.throws(()=>requireV5Preflight(p,environment,runner,source,'development',lock));}
 assert.throws(()=>requireV5Preflight(preflight,{...environment,source_commit:'c'.repeat(40)},runner,source,'development',lock));
 assert.throws(()=>requireV5Preflight(preflight,environment,{...runner,phases:runner.phases.filter(p=>p.name!=='authority-calibration')},source,'development',lock));
 console.log('v5 authentication and freeze count guards passed');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv[2]==='self-test')selfTest();else await verify(process.argv[2],process.argv[3]);}
