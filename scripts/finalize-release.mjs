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
function requireVerification(value,candidate){
 assert.equal(value.source_commit,candidate,'verification_commit_mismatch');
 assert.equal(value.passed,true,'verification_failed');
 const required=['types','agent-types','site-types','unit','rederive','site-build','migrate','integration','browser','artifact-scan'];
 for(const name of required)assert.ok(value.steps.some(s=>s.name===name&&s.exit_code===0),'missing_verification_step:'+name);
}
async function github(path,method='GET',body){
 const token=process.env.GH_TOKEN??process.env.GITHUB_TOKEN;assert.ok(token,'github_token_required');
 const response=await fetch('https://api.github.com'+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error('github_'+method+'_'+response.status+':'+path);
 return response.status===204?null:response.json();
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
 console.log('release self-test: valid, stale, failed, missing and foreign evidence checks passed');
}
async function verify(){
 const candidate=process.env.CANDIDATE_COMMIT,repo=process.env.GITHUB_REPOSITORY,tag=process.env.RELEASE_TAG??'v0.1.0';
 assert.match(candidate??'',shaPattern,'immutable_candidate_required');assert.equal(repo,'mekala27-45/handoff','unexpected_repository');assert.match(tag,tagPattern);
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
 for(const trace of model.trace_cases){assert.equal(trace.run_id,model.run_id);assert.equal(trace.source_commit,model.source_commit);assert.ok(Array.isArray(trace.entries)&&trace.entries.length>0);}
 assert.ok(model.trace_cases.some(t=>t.entries.some(e=>e.type==='tool_result')),'actual_model_tool_evidence_required');
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
 const attestation={...readiness,candidate_commit:candidate,tag,checked_at:new Date().toISOString(),ci_run:ci.html_url,pages_run:pages.html_url,ci_artifact:'verification-'+candidate,fault_run_id:fault.run_id,fault_applicable:applicable.length,fault_passed:applicable.length,recorded_model:{run_id:model.run_id,source_commit:model.source_commit,status:model.status,metrics:model.metrics},input};
 await writeFile(join(out,'release-candidate.json'),JSON.stringify(input,null,2)+'\n');await writeFile(join(out,'release-readiness.json'),JSON.stringify(attestation,null,2)+'\n');await writeFile(join(out,'hosted.json'),JSON.stringify(hosted,null,2)+'\n');
 const labels=['Dependency, model and no-card host probes recorded','Claim renderer rejects missing or invalid evidence','Synthetic data, split and independent truth registered','Isolated schema and independent persistence check pass','Scoped retrieval and evidence version checks pass','Proposal and monetary policy gates pass','Approval digest, expiry and stale-review gates pass','One simulated effect survives duplicate execution','Functional live API verified from a separate client','Case workbench supports review and honest error states','Actual eve model-generated tool call demonstrated','Registered model attempts graded with full provenance','Applicable failure injections and recovery checks pass','Evaluation views separate scripted, model and recorded runs','Both palettes and required interface checks pass','Runbook, ADRs, skills and public-artifact scans complete','Full suite, clean rederivation and live checks complete','Verified release tag prepared and authorized publication complete'];
 const modelMetric=model.metrics.find(m=>m.metric_id==='proposal_correctness');
 const results='# Handoff release verification\n\nCandidate: `'+candidate+'`. Tag: `'+tag+'`.\n\nAPI: '+apiOrigin+'\n\nPages: '+pagesUrl+'\n\nCI: '+ci.html_url+'\n\nPages deployment: '+pages.html_url+'\n\nFresh applicable fault checks: '+applicable.length+'/'+applicable.length+'. HTTP and Playwright hosted checks passed.\n\nIndependent hosted SQL proof retains original source `'+earlierLedger.source_commit+'`; the current CI database integration is fresh for the candidate. No fresh hosted SQL read is claimed by this workflow.\n\nRecorded actual-model run: `'+model.run_id+'`, original source `'+model.source_commit+'`, status `'+model.status+'`.'+(modelMetric?' Proposal correctness: '+modelMetric.numerator+'/'+modelMetric.denominator+'.':'')+' Preserved model failures remain failures. Scripted workflow safety and actual model quality remain separate. All monetary and message actions are simulated; the preserved local inference actually ran.\n\n'+labels.map((label,i)=>(i+1)+(i===17?'  not done ':'  done ')+label+'; evidence: '+(i===17?'tag preparation passed; publication awaits the following publish job':evidence[i])+'.').join('\n')+'\n\nThis file is a prepared attestation until the publish job has successfully created and verified the annotated tag and release.\n';
 await writeFile(join(out,'RESULTS.md'),results);console.log(JSON.stringify({ready:true,candidate_commit:candidate,ci_run:ci.html_url,pages_run:pages.html_url,assets:out}));
}
async function publish(){
 const repo=process.env.GITHUB_REPOSITORY,candidate=process.env.CANDIDATE_COMMIT,tag=process.env.RELEASE_TAG??'v0.1.0';assert.equal(repo,'mekala27-45/handoff');assert.match(candidate??'',shaPattern);assert.match(tag,tagPattern);
 const att=await read('release-assets/release-readiness.json');assert.equal(att.ready,true);assert.equal(att.candidate_commit,candidate);assert.equal(att.tag,tag);assert.ok(att.input.gates.length===17&&att.input.gates.every(g=>g.done===true));assert.equal(att.input.verification_commit,candidate);assert.equal(att.input.clean_rederivation_commit,candidate);assert.equal(att.input.live_api.source_commit,candidate);assert.equal(att.input.pages.source_commit,candidate);
 let ref;
 try{ref=await github('/repos/'+repo+'/git/ref/tags/'+tag);}catch(error){if(!String(error.message).includes('github_GET_404:'))throw error;}
 if(ref){assert.equal(ref.object.type,'tag','existing_tag_must_be_annotated');const existing=await github('/repos/'+repo+'/git/tags/'+ref.object.sha);assert.equal(existing.object.sha,candidate,'tag_points_elsewhere');}
 else{const object=await github('/repos/'+repo+'/git/tags','POST',{tag,message:'Verified Handoff release '+tag+'\nCandidate: '+candidate+'\nCI: '+att.ci_run+'\nPages: '+att.pages_run,object:candidate,type:'commit'});await github('/repos/'+repo+'/git/refs','POST',{ref:'refs/tags/'+tag,sha:object.sha});}
 let release;try{release=await github('/repos/'+repo+'/releases/tags/'+tag);}catch(error){if(!String(error.message).includes('github_GET_404:'))throw error;}
 if(!release){execFileSync('gh',['release','create',tag,'--repo',repo,'--verify-tag','--draft','--title','Handoff '+tag,'--notes-file','release-assets/RESULTS.md'],{stdio:'inherit'});release=await github('/repos/'+repo+'/releases/tags/'+tag);}
 const finalResults=(await readFile('release-assets/RESULTS.md','utf8')).replace('18  not done Verified release tag prepared and authorized publication complete; evidence: tag preparation passed; publication awaits the following publish job.','18  done Verified release tag prepared and authorized publication complete; evidence: annotated tag '+tag+' and this published release.').replace('This file is a prepared attestation until the publish job has successfully created and verified the annotated tag and release.','The publish job verified the annotated tag target and every required release asset before completing publication.');
 await writeFile('release-assets/RESULTS.md',finalResults);att.publication={tag,candidate_commit:candidate,authorized:true};await writeFile('release-assets/release-readiness.json',JSON.stringify(att,null,2)+'\n');
 execFileSync('gh',['release','upload',tag,'--repo',repo,'--clobber','release-assets/release-candidate.json','release-assets/release-readiness.json','release-assets/hosted.json','release-assets/RESULTS.md'],{stdio:'inherit'});
 const prepared=await github('/repos/'+repo+'/releases/tags/'+tag);for(const name of ['release-candidate.json','release-readiness.json','hosted.json','RESULTS.md'])assert.ok(prepared.assets.some(a=>a.name===name),'release_asset_missing:'+name);
 await github('/repos/'+repo+'/releases/'+prepared.id,'PATCH',{draft:false,body:finalResults});
 const verified=await github('/repos/'+repo+'/releases/tags/'+tag);assert.equal(verified.draft,false);console.log(JSON.stringify({published:true,url:verified.html_url,tag,candidate_commit:candidate}));
}
const mode=process.argv[2];
if(mode==='self-test')selfTest();else if(mode==='verify')await verify();else if(mode==='publish')await publish();else throw Error('use_self-test_verify_or_publish');
