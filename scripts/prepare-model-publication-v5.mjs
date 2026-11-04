import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {sha256} from '../build/packages/domain/canonical.js';

const repository='mekala27-45/handoff',branch='model-publication-evidence-v5';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
assert.equal(process.env.GITHUB_REPOSITORY,repository);assert.equal(process.env.GITHUB_REF,'refs/heads/agent-results-v5');assert.ok(process.env.GH_TOKEN);
const dev=await read('reports/checks/model-v5-pre-freeze.json'),held=await read('reports/checks/model-v5-heldout.json');
assert.equal(held.current_checkout,process.env.GITHUB_SHA);assert.equal(dev.independently_regraded,true);assert.equal(held.independently_regraded,true);
const output=new Set(['reports/checks/model-v5-heldout.json']);
const safe=file=>/^reports\/(?:(?:runs|model-traces)\/model-(?:development|heldout)-v5-\d+(?:-fx_[a-f0-9]{20}|-cases|-progress)?\.(?:json|txt)|environments\/model-experiment-v5-ci-\d+\.json|checks\/(?:model-preflight-v5|model-experiment-v5-(?:runner|diagnostics))\.json)$/.test(file);
for(const [att,split] of [[dev,'development'],[held,'held-out']]){
 const workflow=att.original_evidence.workflow_run_id,dir=resolve('.local/v5-original-'+workflow);
 if(split==='development'){await mkdir(dir,{recursive:true});execFileSync('gh',['run','download',String(workflow),'--repo',repository,'--name','model-experiment-v5-'+att.source_commit,'--dir',dir],{stdio:'inherit'});}
 const manifest=await read(join(dir,'export-manifest.json'));assert.equal(manifest.source_commit,att.source_commit);assert.equal(manifest.split,split);assert.equal(manifest.experiment,'v5');assert.equal(manifest.private_logs_exported,false);assert.equal(sha256(await readFile(join(dir,'export-manifest.json'))),att.original_evidence.export_manifest_digest);
 const mirror='reports/model-experiments/'+workflow;
 await mkdir(mirror,{recursive:true});await copyFile(join(dir,'export-manifest.json'),mirror+'/export-manifest.json');output.add(mirror+'/export-manifest.json');
 const seen=new Set();for(const entry of manifest.exported){assert.ok(safe(entry.file)&&!seen.has(entry.file),'safe_unique_original_export');seen.add(entry.file);const source=join(dir,entry.file);assert.equal(sha256(await readFile(source)),entry.sha256);
  const target=mirror+'/'+entry.file;await mkdir(dirname(target),{recursive:true});await copyFile(source,target);output.add(target);
  if(/^reports\/(?:runs|model-traces)\//.test(entry.file)){await mkdir(dirname(entry.file),{recursive:true});await copyFile(source,entry.file);output.add(entry.file);}
 }
 const metadata={workflow_run_id:workflow,artifact_id:att.original_evidence.artifact_id,artifact_digest:att.original_evidence.artifact_digest,source_commit:att.source_commit,split,original_bytes_preserved:true};await writeFile(mirror+'/publication.json',JSON.stringify(metadata,null,2)+'\n');output.add(mirror+'/publication.json');
}
execFileSync(process.execPath,['build/scripts/publish-model-experiment-v5.js',dev.run_id,held.run_id],{stdio:'inherit'});
for(const att of [dev,held])for(const prefix of ['apps/site/public/reports/','reports/public/'])for(const suffix of ['.json','-cases.json','-traces.json'])output.add(prefix+att.run_id+suffix);
output.add('apps/site/public/reports/index.json');
const evidence={version:5,source_commit:process.env.GITHUB_SHA,prepared_at:new Date().toISOString(),development:{run_id:dev.run_id,counts:dev.counts},held_out:{run_id:held.run_id,counts:held.counts},files:[]};
const files=[];for(const file of [...output].sort()){
 const bytes=await readFile(file),content=bytes.toString('utf8');assert.ok(Buffer.from(content).equals(bytes));
 assert.ok(!/(?:npg_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{24,}|sk-proj-[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@(?!localhost|127\.0\.0\.1))/.test(content),'private_value_in_publication');assert.ok(!/"capability"\s*:\s*"[A-Za-z0-9_-]{32,}"/.test(content));assert.ok(!content.includes(process.env.GH_TOKEN));
 evidence.files.push({path:file,sha256:sha256(bytes),bytes:bytes.length});files.push({path:file,content});
}
files.push({path:'publication-manifest.json',content:JSON.stringify(evidence,null,2)+'\n'});
async function api(endpoint,method='GET',body){const response=await fetch('https://api.github.com/repos/'+repository+'/'+endpoint,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});if(method==='GET'&&response.status===404)return null;assert.ok(response.ok,'publication_github_'+response.status);return response.json();}
const prior=await api('git/ref/heads/'+branch);
if(prior){const priorManifest=await api('contents/publication-manifest.json?ref='+branch);assert.equal(priorManifest.encoding,'base64');const parsed=JSON.parse(Buffer.from(priorManifest.content,'base64').toString('utf8'));assert.deepEqual(parsed.files,evidence.files,'publication_evidence_is_immutable');console.log('Publication evidence already preserved.');}
else {
 const entries=[];for(const file of files){const blob=await api('git/blobs','POST',{content:Buffer.from(file.content).toString('base64'),encoding:'base64'});entries.push({path:file.path,mode:'100644',type:'blob',sha:blob.sha});}
 const tree=await api('git/trees','POST',{tree:entries}),commit=await api('git/commits','POST',{message:'Preserve authenticated v5 development and held-out publication',tree:tree.sha,parents:[]});await api('git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});console.log(JSON.stringify({published_evidence_branch:branch,commit:commit.sha,files:files.length,development:dev.counts,held_out:held.counts}));
}
await mkdir('reports/checks',{recursive:true});await writeFile('reports/checks/model-v5-publication.json',JSON.stringify(evidence,null,2)+'\n');
