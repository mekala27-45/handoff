import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { summarizeModelExperiment } from './model-experiment-diagnostics.mjs';
import { preflightFailureCode,validateModelLock } from './model-preflight-v4.mjs';

// This runner starts only task-owned loopback services in an isolated CI job.
// The evaluation channel key stays in memory and child environments, never artifacts.
if(process.platform!=='linux')throw Error('linux_ci_runner_required');
if(process.env.HANDOFF_MODEL_EXPERIMENT!=='v4')throw Error('explicit_v4_experiment_required');
const dbUrl=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(dbUrl.hostname)||dbUrl.pathname!=='/handoff')throw Error('disposable_local_database_required');
const args=process.argv.slice(2);
if(args.length!==1||!['--development','--held-out'].includes(args[0]))throw Error('explicit_experiment_split_required');
const split=args[0]==='--held-out'?'held-out':'development';
if(split==='held-out')await readFile('eval/plans/model-config-v4.json','utf8');
const root=process.cwd(),startedAt=new Date().toISOString(),began=Date.now();
const privateDir=path.join(root,'.local/model-experiment-ci-v4');
const exportDir=path.join(process.env.RUNNER_TEMP??path.join(root,'.local'),'handoff-model-experiment-export-v4');
await mkdir(privateDir,{recursive:true});await mkdir(exportDir,{recursive:true});
const lock=JSON.parse(await readFile('docs/sources/model-lock-v4.json','utf8'));
const {model:{name:modelName}}=validateModelLock(lock);
const binary=process.env.HANDOFF_OLLAMA_BINARY;
if(!binary||!path.isAbsolute(binary))throw Error('absolute_pinned_ollama_binary_required');
const env={...process.env,HANDOFF_EVAL_TOKEN:randomBytes(32).toString('hex'),HANDOFF_V4_REPO_ROOT:root,EVE_TELEMETRY_DISABLED:'1',OLLAMA_HOST:'127.0.0.1:11435',OLLAMA_MODELS:path.join(root,'.local/models-v4'),OLLAMA_NO_CLOUD:'1',OLLAMA_CONTEXT_LENGTH:'8192',OLLAMA_KEEP_ALIVE:'30m',OLLAMA_NUM_PARALLEL:'1',OLLAMA_MAX_LOADED_MODELS:'1',CUDA_VISIBLE_DEVICES:'-1',HIP_VISIBLE_DEVICES:'-1',ROCR_VISIBLE_DEVICES:'-1',GGML_VK_VISIBLE_DEVICES:'-1',OLLAMA_VULKAN:'0'};
const children=[],phases=[];
let failed=false,deadline;
function start(name,command,args,service=false,cwd=root){
 const stdout=createWriteStream(path.join(privateDir,name+'.stdout.log')),stderr=createWriteStream(path.join(privateDir,name+'.stderr.log'));
 const child=spawn(command,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe'],windowsHide:true});
 child.stdout.pipe(stdout);child.stderr.pipe(stderr);child.on('error',error=>{child.startError=error;});
 const item={name,child,stdout,stderr,service};children.push(item);return item;
}
async function stop(item){
 if(item.child.pid&&(item.service||item.child.exitCode===null)){try{process.kill(-item.child.pid,'SIGTERM');}catch{}}
 await new Promise(resolve=>setTimeout(resolve,250));
 if(item.child.pid&&(item.service||item.child.exitCode===null)){try{process.kill(-item.child.pid,'SIGKILL');}catch{}}
 item.stdout.end();item.stderr.end();
}
async function command(name,program,args){
 const item=start(name,program,args),code=await new Promise(resolve=>{item.child.once('error',()=>resolve(1));item.child.once('close',code=>resolve(code??1));});
 await Promise.all([finished(item.stdout),finished(item.stderr)]);
 const phase={name,exit_code:code};
 if(code!==0&&name==='cpu-preflight'){
  const checked=preflightFailureCode(await readFile(path.join(privateDir,name+'.stderr.log'),'utf8'));
  if(checked){phase.failure_code=checked;console.error('cpu_preflight_checked_failure:'+checked);}
 }
 phases.push(phase);
 if(code!==0)throw Error(name+'_failed');console.log(name+': passed');
}
async function ready(name,item,url,headers={}){
 const until=Date.now()+90000;
 while(Date.now()<until){
  if(item.child.startError||item.child.exitCode!==null)throw Error(name+'_exited_before_ready');
  try{const response=await fetch(url,{headers,signal:AbortSignal.timeout(2000)});if(response.ok){phases.push({name,ready:true});return;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw Error(name+'_readiness_timeout');
}
async function snapshot(){
 const files=new Map();
 async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else if(/\.(json|jsonl|txt)$/.test(item.name))files.set(file,createHash('sha256').update(await readFile(file)).digest('hex'));}}
 for(const dir of ['reports/runs','reports/model-traces','reports/environments','reports/checks'])await walk(dir);
 return files;
}
const before=await snapshot();
try{
 deadline=setTimeout(()=>{failed=true;console.error('model_experiment_total_deadline');for(const item of children)if(item.child.pid&&(item.service||item.child.exitCode===null))try{process.kill(-item.child.pid,'SIGKILL');}catch{}},75*60*1000);
 await command('migrate',process.execPath,['build/scripts/migrate.js']);
 const owner=new pg.Pool({connectionString:env.DATABASE_URL,max:1});
 try{await owner.query(await readFile('packages/db/agent-role.sql','utf8'));}finally{await owner.end();}
 phases.push({name:'isolated_agent_role',passed:true});
 await command('authority-calibration',process.execPath,['--test','--test-concurrency=1','build/tests/integration/authority-v4.test.js']);
 const ollama=start('ollama',binary,['serve'],true);await ready('ollama',ollama,'http://127.0.0.1:11435/api/version');
 const version=await fetch('http://127.0.0.1:11435/api/version').then(r=>r.json());
 if(version.version!==lock.ollama_version)throw Error('pinned_ollama_version_mismatch');
 await command('pull-pinned-model',binary,['pull',modelName]);
 await command('cpu-preflight',process.execPath,['scripts/model-preflight-v4.mjs']);
 const hardware=await fetch('http://127.0.0.1:11435/api/ps').then(r=>r.json());
 const model=hardware.models?.find(m=>m.name===modelName);
 if(!model||model.digest!==lock.model.digest||model.size_vram!==0||model.context_length!==8192)throw Error('model_cpu_or_digest_mismatch');
 await mkdir('reports/environments',{recursive:true});
 await writeFile('reports/environments/model-experiment-v4-ci-'+Date.now()+'.json',JSON.stringify({observed_at:new Date().toISOString(),source_commit:process.env.GITHUB_SHA??null,platform:process.platform,node:process.version,cpu_model:cpus()[0]?.model??null,cpu_count:cpus().length,memory_bytes:totalmem(),ollama_version:version.version,model:{name:model.name,digest:model.digest,size:model.size,size_vram:model.size_vram,context_length:model.context_length},execution:'CPU',split,note:'Actual model warm-up is excluded from graded attempts.'},null,2)+'\n');
 const eve=start('eve',process.execPath,[path.join(root,'node_modules/eve/bin/eve.js'),'dev','--no-ui','--no-default-extensions','--host','127.0.0.1','--port','2088'],true,path.join(root,'agent-v4'));
 await ready('eve',eve,'http://127.0.0.1:2088/evaluation/info',{'x-evaluation-key':env.HANDOFF_EVAL_TOKEN});
 await command('model-evaluation',process.execPath,['build/eval/harness/model-experiment-v4.js',args[0]]);
}catch(error){failed=true;const reason=/^[a-z0-9_-]{1,100}$/.test(error.message)?error.message:'runner_process_failed';phases.push({name:'runner_error',reason});console.error(reason);}
finally{
 clearTimeout(deadline);for(const item of children.reverse())await stop(item);
 const result={source_commit:process.env.GITHUB_SHA??null,started_at:startedAt,finished_at:new Date().toISOString(),elapsed_ms:Date.now()-began,split,runner_succeeded:!failed,model_quality:'Read the actual experiment run manifest; runner success is not proposal correctness.',phases};
 await mkdir('reports/checks',{recursive:true});await writeFile('reports/checks/model-experiment-v4-runner.json',JSON.stringify(result,null,2)+'\n');
 const diagnosticInputs=[];
 for(const [file,hash] of await snapshot())if(before.get(file)!==hash)diagnosticInputs.push({file,text:await readFile(file,'utf8')});
 const diagnostics=summarizeModelExperiment(diagnosticInputs);
 await writeFile('reports/checks/model-experiment-v4-diagnostics.json',JSON.stringify(diagnostics,null,2)+'\n');
 for(const row of diagnostics.cases)console.log('model_case_diagnostic '+JSON.stringify(row));
 const after=await snapshot(),exported=[];
 for(const [file,hash] of after){if(before.get(file)===hash)continue;const text=await readFile(file,'utf8');
  if(text.includes(env.HANDOFF_EVAL_TOKEN)||/"capability"\s*:\s*"[A-Za-z0-9_-]{32,}"/.test(text)||/postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@(?!localhost|127\.0\.0\.1)/i.test(text))throw Error('private_value_in_report_export');
  const dest=path.join(exportDir,file);await mkdir(path.dirname(dest),{recursive:true});await copyFile(file,dest);exported.push({file,sha256:hash});
 }
 await writeFile(path.join(exportDir,'export-manifest.json'),JSON.stringify({experiment:'v4',source_commit:process.env.GITHUB_SHA??null,split,exported,private_logs_exported:false},null,2)+'\n');
 if(failed)process.exitCode=1;
}
