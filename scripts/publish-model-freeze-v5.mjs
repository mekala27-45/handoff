import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest,sha256} from '../build/packages/domain/canonical.js';
import {requireV5Counts} from './verify-model-v5.mjs';
const repository='mekala27-45/handoff',branch='model-freeze-evidence-v5';
const paths=['eval/plans/model-config-v5.json','reports/checks/model-v5-pre-freeze.json'];
const read=async p=>JSON.parse(await readFile(p,'utf8'));
async function github(endpoint,method='GET',body){const r=await fetch('https://api.github.com/repos/'+repository+'/'+endpoint,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});if(method==='GET'&&r.status===404)return null;assert.ok(r.ok,'freeze_publication_'+r.status);return r.json();}
assert.equal(process.env.GITHUB_REPOSITORY,repository);assert.equal(process.env.GITHUB_REF,'refs/heads/agent-freeze-v5');assert.ok(process.env.GH_TOKEN);
const frozen=await read(paths[0]),att=await read(paths[1]),plan=await read('eval/plans/model-experiment-v5.json'),request=await read('docs/model-v5-freeze-request.json');
assert.equal(att.current_checkout,process.env.GITHUB_SHA);assert.equal(att.kind,'verified-pre-freeze-development');assert.equal(att.independently_regraded,true);assert.equal(att.original_evidence.workflow_run_id,request.development_workflow_run_id);
assert.equal(frozen.configuration_digest,digest(frozen.configuration));assert.equal(att.configuration_digest,frozen.configuration_digest);assert.equal(att.run_id,frozen.development_run_id);assert.equal(att.source_commit,frozen.development_source_commit);assert.ok(Date.parse(frozen.frozen_at)>=Date.parse(att.checked_at));requireV5Counts(att.counts,plan,'development');
for(const [file,hash] of Object.entries(frozen.configuration.files))assert.equal(sha256((await readFile(file,'utf8')).replaceAll('\r\n','\n')),hash);
const tree=[];for(const path of paths){const content=await readFile(path,'utf8');assert.ok(Buffer.byteLength(content)<1000000);assert.ok(!/(?:gh[pousr]_[A-Za-z0-9]{24,}|npg_[A-Za-z0-9]{10,}|postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@)/.test(content));tree.push({path,mode:'100644',type:'blob',content});}
const prior=await github('git/ref/heads/'+branch);
if(prior){for(const path of paths){const old=await github('contents/'+path+'?ref='+branch);assert.equal(old?.encoding,'base64');assert.equal(Buffer.from(old.content,'base64').toString('utf8'),tree.find(e=>e.path===path).content,'freeze_evidence_immutable');}}
else {const t=await github('git/trees','POST',{tree}),c=await github('git/commits','POST',{message:'Preserve authenticated v5 freeze for '+att.run_id,tree:t.sha,parents:[]});await github('git/refs','POST',{ref:'refs/heads/'+branch,sha:c.sha});}
console.log(JSON.stringify({freeze_evidence_preserved:true,branch,configuration_digest:frozen.configuration_digest}));
