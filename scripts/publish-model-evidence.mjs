import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { lstat, readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizeModelExperiment } from './model-experiment-diagnostics.mjs';

// Runs only in the isolated publication job. Never checks out or writes source branches.
const repository='mekala27-45/handoff',branch='model-evidence-v3';
const first={run:'41326684887',artifact:'13092085189',source:'e55d3b9df58a20837e6e19b9630f8e4003868815',name:'model-development-v3-e55d3b9df58a20837e6e19b9630f8e4003868815'};
const hash=text=>createHash('sha256').update(text).digest('hex');
const fail=code=>{throw Error(code);};
const safePath=file=>typeof file==='string'&&/^reports\/(runs|model-traces|environments|checks)\/[A-Za-z0-9_./-]+\.(json|jsonl|txt)$/.test(file)&&file.split('/').every(p=>p!=='.'&&p!=='..'&&p!=='');
function validateText(text){
 if(/"capability"\s*:\s*"[A-Za-z0-9_-]{32,}"/.test(text)||/postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@(?!localhost(?=[:/])|127\.0\.0\.1(?=[:/]))/i.test(text))fail('private_value_in_evidence');
 for(const name of ['GH_TOKEN','GITHUB_TOKEN','HANDOFF_EVAL_TOKEN']){const value=process.env[name];if(value&&value.length>=16&&text.includes(value))fail('private_value_in_evidence');}
}
async function readExport(dir,source){
 const manifestText=await readFile(path.join(dir,'export-manifest.json'),'utf8'),manifest=JSON.parse(manifestText);
 if(manifest.source_commit!==source||!['development','held-out'].includes(manifest.split)||manifest.private_logs_exported!==false||!Array.isArray(manifest.exported))fail('invalid_export_manifest');
 const files=new Map([['export-manifest.json',manifestText]]);
 for(const entry of manifest.exported){
  if(!safePath(entry.file)||!/^[a-f0-9]{64}$/.test(entry.sha256??'')||files.has(entry.file))fail('invalid_export_entry');
  const target=path.join(dir,...entry.file.split('/'));if(!(await lstat(target)).isFile())fail('evidence_regular_file_required');
  const bytes=await readFile(target),text=bytes.toString('utf8');
  if(hash(bytes)!==entry.sha256||!Buffer.from(text,'utf8').equals(bytes))fail('evidence_hash_or_encoding_mismatch');
  validateText(text);files.set(entry.file,text);
 }
 async function inspect(subdir,prefix=''){for(const entry of await readdir(subdir,{withFileTypes:true})){const file=prefix+entry.name;if(entry.isDirectory())await inspect(path.join(subdir,entry.name),file+'/');else if(!entry.isFile()||!files.has(file))fail('unmanifested_evidence_file');}}
 await inspect(dir);validateText(manifestText);
 const diagnostics=summarizeModelExperiment([...files].map(([file,text])=>({file,text})));
 files.set('diagnostics.json',JSON.stringify(diagnostics,null,2)+'\n');
 return {files,manifest,diagnostics};
}
async function api(endpoint,{method='GET',body,optional=false}={}){
 const response=await fetch('https://api.github.com/repos/'+repository+'/'+endpoint,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 if(optional&&response.status===404)return null;
 if(!response.ok)fail('github_evidence_api_'+response.status);
 return response.json();
}
async function verifyRun(run,source){
 const data=await api('actions/runs/'+run);
 if(data.head_sha!==source||data.head_branch!=='agent-quality-v3'||data.path!=='.github/workflows/model-experiment.yml'||!['push','workflow_dispatch'].includes(data.event))fail('unexpected_evidence_run');
}
async function main(){
 if(process.env.GITHUB_REPOSITORY!==repository||process.env.GITHUB_REF!=='refs/heads/agent-quality-v3'||!process.env.GH_TOKEN)fail('evidence_publication_scope_required');
 const run=process.env.GITHUB_RUN_ID,source=process.env.GITHUB_SHA;
 if(!/^\d+$/.test(run??'')||!/^[a-f0-9]{40}$/.test(source??''))fail('invalid_current_run');
 const ref=await api('git/ref/heads/'+branch,{optional:true});
 let parent=null,baseTree=null,existing=[];
 if(ref){parent=ref.object.sha;const commit=await api('git/commits/'+parent);baseTree=commit.tree.sha;const tree=await api('git/trees/'+baseTree+'?recursive=1');if(tree.truncated)fail('evidence_tree_truncated');existing=tree.tree;
  if(existing.some(e=>!['README.md','index.json'].includes(e.path)&&!/^runs\/\d+(?:\/|$)/.test(e.path)))fail('unexpected_evidence_branch_content');
 }
 const hasRun=id=>existing.some(e=>e.path==='runs/'+id+'/export-manifest.json');
 const exports=[];
 if(!hasRun(first.run)){
  await verifyRun(first.run,first.source);
  const artifact=await api('actions/artifacts/'+first.artifact);
  if(artifact.name!==first.name||artifact.workflow_run?.id!==Number(first.run)||artifact.digest!=='sha256:91011f1737dc8eb862a0827118047777468fe94e85faa5d38f6d32881296a777')fail('unexpected_first_artifact');
  exports.push({run:first.run,artifact:first.artifact,...await readExport(path.join(process.env.RUNNER_TEMP,'evidence-first'),first.source)});
 }
 if(!hasRun(run)){
  const currentDir=path.join(process.env.RUNNER_TEMP,'evidence-current');
  if(await lstat(path.join(currentDir,'export-manifest.json')).catch(()=>null)){
   await verifyRun(run,source);
   const artifacts=await api('actions/runs/'+run+'/artifacts');
   const artifact=artifacts.artifacts?.find(a=>a.name===process.env.HANDOFF_EVIDENCE_ARTIFACT_NAME);
   if(!artifact)fail('current_artifact_not_found');
   exports.push({run,artifact:String(artifact.id),...await readExport(currentDir,source)});
  }else console.log('model_evidence_current_export_missing');
 }
 if(!exports.length){console.log('model_evidence_already_preserved');return;}
 const changes=[];
 for(const item of exports){
  item.files.set('publication.json',JSON.stringify({workflow_run_id:item.run,artifact_id:item.artifact,source_commit:item.manifest.source_commit,split:item.manifest.split,raw_exports_preserved:true,private_logs_exported:false},null,2)+'\n');
  for(const [file,content] of item.files){const blob=await api('git/blobs',{method:'POST',body:{content:Buffer.from(content).toString('base64'),encoding:'base64'}});changes.push({path:'runs/'+item.run+'/'+file,mode:'100644',type:'blob',sha:blob.sha});}
 }
 const readme='# Handoff model v3 evidence\n\nSynthetic actual-model exports from the original GitHub Actions workflow. Each run retains its original export manifest and report bytes, plus bounded diagnostics. Runner completion does not mean model correctness. The failed initial development attempt is retained. Source and release branches are never changed by this publisher.\n';
 changes.push({path:'README.md',mode:'100644',type:'blob',content:readme});
 const tree=await api('git/trees',{method:'POST',body:{...(baseTree?{base_tree:baseTree}:{}),tree:changes}});
 const commit=await api('git/commits',{method:'POST',body:{message:'Preserve model experiment evidence: '+exports.map(e=>e.run).join(', '),tree:tree.sha,parents:parent?[parent]:[]}});
 if(parent)await api('git/refs/heads/'+branch,{method:'PATCH',body:{sha:commit.sha,force:false}});
 else await api('git/refs',{method:'POST',body:{ref:'refs/heads/'+branch,sha:commit.sha}});
 console.log(JSON.stringify({model_evidence_branch:branch,commit:commit.sha,runs:exports.map(e=>({run:e.run,files:e.files.size,split:e.manifest.split}))}));
 for(const item of exports)for(const row of item.diagnostics.cases)console.log('model_case_diagnostic '+JSON.stringify(row));
}
async function selfTest(){
 const dir=await mkdtemp(path.join(tmpdir(),'handoff-evidence-test-'));
 try{
  const file='reports/checks/synthetic.json',text='{"synthetic":true}\n',source='a'.repeat(40);
  await mkdir(path.join(dir,'reports/checks'),{recursive:true});await writeFile(path.join(dir,file),text);
  const manifest={source_commit:source,split:'development',private_logs_exported:false,exported:[{file,sha256:hash(text)}]};
  await writeFile(path.join(dir,'export-manifest.json'),JSON.stringify(manifest));
  assert.equal((await readExport(dir,source)).files.get(file),text);
  assert.equal(safePath('reports/checks/../../.eve/secret.json'),false);
  await writeFile(path.join(dir,file),'changed');await assert.rejects(readExport(dir,source),/evidence_hash_or_encoding_mismatch/);
  assert.throws(()=>validateText('{"capability":"'+'z'.repeat(40)+'"}'),/private_value_in_evidence/);
  assert.throws(()=>validateText('postgresql:'+'//example:private@remote.example/db'),/private_value_in_evidence/);
  console.log('model evidence validation self-test passed');
 }finally{
  if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('handoff-evidence-test-'))fail('unexpected_test_cleanup_path');
  await rm(dir,{recursive:true,force:true});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const task=process.argv[2]==='--self-test'?selfTest:main;
 task().catch(error=>{console.error(/^[a-z0-9_]+$/.test(error.message)?error.message:'model_evidence_publication_failed');process.exitCode=1;});
}
