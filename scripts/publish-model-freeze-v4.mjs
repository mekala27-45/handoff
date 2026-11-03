import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {requirePreFreezeAttestation} from './finalize-release-v4.mjs';

const repository='mekala27-45/handoff',branch='model-freeze-evidence-v4';
const paths=['eval/plans/model-config-v4.json','reports/checks/model-v4-pre-freeze.json'];
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const sha256=value=>createHash('sha256').update(value).digest('hex');
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';}
export function requireFreezePair(frozen,attestation,request,context){
 assert.equal(context.repository,repository);assert.equal(context.ref,'refs/heads/agent-freeze-v4');assert.match(context.sha??'',/^[a-f0-9]{40}$/);assert.equal(attestation.current_checkout,context.sha,'v4_freeze_checkout');
 assert.deepEqual(Object.keys(request).sort(),['development_run_id','version']);assert.equal(request.version,4);assert.match(request.development_run_id,/^model-development-v4-\d+$/);assert.equal(attestation.development_run_id,request.development_run_id,'v4_freeze_request');
 assert.equal(frozen.development_run_id,attestation.development_run_id);assert.equal(frozen.development_source_commit,attestation.development_source_commit);assert.equal(frozen.configuration_digest,attestation.configuration_digest);assert.equal(sha256(canonical(frozen.configuration)),frozen.configuration_digest,'v4_freeze_configuration_digest');
 assert.ok(Number.isFinite(Date.parse(frozen.frozen_at))&&Date.parse(frozen.frozen_at)>=Date.parse(attestation.checked_at),'v4_freeze_before_verification');
}
async function github(path,method='GET',body){
 const token=process.env.GH_TOKEN??process.env.GITHUB_TOKEN;assert.ok(token,'v4_freeze_token_required');const response=await fetch('https://api.github.com/repos/'+repository+'/'+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 if(method==='GET'&&response.status===404)return null;assert.ok(response.ok,'v4_freeze_github_'+method+'_'+response.status);return response.json();
}
async function publish(){
 const frozen=await read(paths[0]),attestation=await read(paths[1]),request=await read('docs/model-v4-freeze-request.json'),context={repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,sha:process.env.GITHUB_SHA};requireFreezePair(frozen,attestation,request,context);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),context.sha,'v4_freeze_actual_checkout');
 requirePreFreezeAttestation(attestation,{configuration:frozen.configuration,plan:await read('eval/plans/model-experiment-v4.json'),registered:await read('eval/plans/registered.json'),v3:await read('eval/plans/model-experiment-v3.json'),lock:await read('docs/sources/model-lock-v4.json')});
 for(const [file,hash] of Object.entries(frozen.configuration.files))assert.equal(sha256((await readFile(file,'utf8')).replaceAll('\r\n','\n')),hash,'v4_freeze_current_file:'+file);
 const tree=[];for(const path of paths){const content=await readFile(path,'utf8');assert.ok(Buffer.byteLength(content)<=1000000,'v4_freeze_file_size');assert.ok(!/(?:gh[pousr]_[A-Za-z0-9]{24,}|npg_[A-Za-z0-9]{10,}|postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@)/.test(content),'v4_freeze_private_value');tree.push({path,mode:'100644',type:'blob',content});}
 const prior=await github('git/ref/heads/'+branch);if(prior){for(const path of paths){const existing=await github('contents/'+path+'?ref='+branch);assert.ok(existing?.encoding==='base64','v4_freeze_existing_file');assert.equal(Buffer.from(existing.content,'base64').toString('utf8'),tree.find(entry=>entry.path===path).content,'v4_freeze_evidence_is_immutable');}console.log(JSON.stringify({freeze_evidence_preserved:true,branch,development_run_id:frozen.development_run_id}));return;}
 const createdTree=await github('git/trees','POST',{tree}),commit=await github('git/commits','POST',{message:'Preserve verified v4 freeze for '+frozen.development_run_id,tree:createdTree.sha,parents:[]});await github('git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});
 console.log(JSON.stringify({freeze_evidence_preserved:true,branch,commit:commit.sha,development_run_id:frozen.development_run_id,configuration_digest:frozen.configuration_digest,files:paths}));
}
function selfTest(){
 const configuration={version:4},configuration_digest=sha256(canonical(configuration)),sha='a'.repeat(40),attestation={current_checkout:sha,development_run_id:'model-development-v4-1',development_source_commit:'b'.repeat(40),configuration_digest,checked_at:'2026-11-03T00:00:00.000Z'},frozen={configuration,configuration_digest,development_run_id:attestation.development_run_id,development_source_commit:attestation.development_source_commit,frozen_at:'2026-11-03T00:00:01.000Z'},request={version:4,development_run_id:attestation.development_run_id},context={repository,ref:'refs/heads/agent-freeze-v4',sha};requireFreezePair(frozen,attestation,request,context);
 for(const changed of [{...context,repository:'foreign/repo'},{...context,ref:'refs/heads/main'},{...context,sha:'c'.repeat(40)}])assert.throws(()=>requireFreezePair(frozen,attestation,request,changed));for(const changed of [{...frozen,configuration:{version:5}},{...frozen,development_source_commit:'c'.repeat(40)},{...frozen,frozen_at:'2026-11-02T00:00:00.000Z'}])assert.throws(()=>requireFreezePair(changed,attestation,request,context));assert.throws(()=>requireFreezePair(frozen,attestation,{...request,extra:'unreviewed'},context));console.log('v4 freeze publisher self-test: branch, source, request, digest and time guards passed');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv[2]==='self-test')selfTest();else if(process.argv[2]===undefined)await publish();else throw Error('use_self-test_or_no_argument');}
