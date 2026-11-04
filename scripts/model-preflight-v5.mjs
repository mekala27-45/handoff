import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const allowedModels=new Set(['qwen3:1.7b-q4_K_M','qwen3:4b-q4_K_M']),origin='http://127.0.0.1:11435';
export function validateModelLock(lock){if(lock?.ollama_version!=='0.40.13'||!allowedModels.has(lock?.model?.name)||!/^[a-f0-9]{64}$/.test(lock?.model?.digest??''))throw Error('model_lock_invalid');return {ollama_version:lock.ollama_version,model:{name:lock.model.name,digest:lock.model.digest}};}
const failures=new Set(['model_lock_invalid','ollama_version_request_failed','ollama_version_changed','model_tags_request_failed','model_digest_changed_or_missing','model_show_request_failed','model_metadata_mismatch','model_warmup_request_failed','model_warmup_failed','model_warmup_response_invalid','model_status_request_failed','cpu_context_preflight_failed','model_preflight_unexpected_failure']);
const safeVersion=value=>typeof value==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[A-Za-z0-9.]{1,30})?$/.test(value)?value:null;
const safeCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER?value:null;
const safeStatus=value=>Number.isInteger(value)&&value>=100&&value<=599?value:null;
function safeModel(value,modelName){
 if(!allowedModels.has(modelName)||!value||value.name!==modelName)return null;
 return {name:modelName,digest:typeof value.digest==='string'&&/^[a-f0-9]{64}$/.test(value.digest)?value.digest:null,size:safeCount(value.size),size_vram:safeCount(value.size_vram),context_length:safeCount(value.context_length)};
}
function safeShow(value,modelName){
 if(!allowedModels.has(modelName)||!value||typeof value!=='object')return null;
 const details=value.details??{},parameter=typeof details.parameter_size==='string'&&/^\d{1,3}(?:\.\d{1,3})?[BM]$/.test(details.parameter_size)?details.parameter_size:null;
 const license=typeof value.license==='string'&&(value.license.trim()==='Apache-2.0'||/Apache\s+License/i.test(value.license)&&/Version\s+2\.0/i.test(value.license))?'Apache-2.0':null;
 return {name:modelName,details:{family:details.family==='qwen3'?'qwen3':null,quantization_level:details.quantization_level==='Q4_K_M'?'Q4_K_M':null,parameter_size:parameter},capabilities:['completion','tools','thinking'].filter(cap=>Array.isArray(value.capabilities)&&value.capabilities.includes(cap)),license};
}
function expectedMetadata(value,modelName){
 const data=safeShow(value,modelName),parameter=data?.details.parameter_size,minimum=modelName==='qwen3:4b-q4_K_M'?4:1.7;
 const billions=parameter?Number.parseFloat(parameter)*(parameter.endsWith('M')?0.001:1):0;
 return !!data&&data.details.family==='qwen3'&&data.details.quantization_level==='Q4_K_M'&&billions>=minimum&&billions<minimum*1.5&&data.capabilities.includes('completion')&&data.capabilities.includes('tools')&&data.license==='Apache-2.0';
}
export function preflightFailureCode(stderr){
 if(typeof stderr!=='string')return null;
 const code=stderr.slice(-16384).match(/(?:^|\r?\n)model_preflight_failure:([a-z_]{1,80})(?:\r?\n|$)/)?.[1];
 return failures.has(code)?code:null;
}
async function metadata(fetchImpl,modelName){
 const result={version:null,tagged_model:null,loaded_model:null,model_metadata:null,version_http_status:null,tags_http_status:null,status_http_status:null,show_http_status:null};
 await Promise.allSettled([
  ['version','version_http_status',value=>{result.version=safeVersion(value.version);}],
  ['tags','tags_http_status',value=>{result.tagged_model=safeModel(value.models?.find(m=>m?.name===modelName),modelName);}],
  ['ps','status_http_status',value=>{result.loaded_model=safeModel(value.models?.find(m=>m?.name===modelName),modelName);}]
 ].map(async([route,key,assign])=>{const response=await fetchImpl(origin+'/api/'+route,{signal:AbortSignal.timeout(3000)});result[key]=safeStatus(response.status);if(response.ok)assign(await response.json());}));
 if(allowedModels.has(modelName))try{const response=await fetchImpl(origin+'/api/show',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:modelName}),signal:AbortSignal.timeout(5000)});result.show_http_status=safeStatus(response.status);if(response.ok)result.model_metadata=safeShow(await response.json(),modelName);}catch{}
 return result;
}
export async function runPreflight(lock,{fetchImpl=fetch}={}){
 let version=null,loaded=null,shown=null,warmupStatus=null,failureCode=null,modelName=null;
 async function json(route,code){try{const response=await fetchImpl(origin+'/api/'+route,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error(code);return await response.json();}catch{throw Error(code);}}
 try{
  modelName=validateModelLock(lock).model.name;
  version=await json('version','ollama_version_request_failed');if(version.version!==lock.ollama_version)throw Error('ollama_version_changed');
  const tags=await json('tags','model_tags_request_failed');if(tags.models?.find(x=>x.name===modelName)?.digest!==lock.model.digest)throw Error('model_digest_changed_or_missing');
  try{const response=await fetchImpl(origin+'/api/show',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:modelName}),signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('model_show_request_failed');shown=await response.json();}catch{throw Error('model_show_request_failed');}
  if(!expectedMetadata(shown,modelName))throw Error('model_metadata_mismatch');
  let warm;try{warm=await fetchImpl(origin+'/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:modelName,prompt:'Ready /no_think',stream:false,options:{num_predict:1,num_ctx:8192,num_gpu:0},keep_alive:'30m'}),signal:AbortSignal.timeout(120000)});}catch{throw Error('model_warmup_request_failed');}
  warmupStatus=safeStatus(warm.status);if(!warm.ok)throw Error('model_warmup_failed');try{await warm.json();}catch{throw Error('model_warmup_response_invalid');}
  const ps=await json('ps','model_status_request_failed');loaded=ps.models?.find(x=>x.name===modelName);
  if(!loaded||loaded.digest!==lock.model.digest||loaded.size_vram!==0||loaded.context_length!==8192)throw Error('cpu_context_preflight_failed');
 }catch(error){failureCode=failures.has(error.message)?error.message:'model_preflight_unexpected_failure';}
 // Probe only known loopback metadata endpoints. Raw server errors, completions,
 // prompts, reasoning, arbitrary model names and environment values are omitted.
 const observed=failureCode?await metadata(fetchImpl,modelName):null;
 return {observed_at:new Date().toISOString(),version:safeVersion(version?.version)??observed?.version??null,model:safeModel(loaded,modelName)??observed?.loaded_model??null,model_metadata:safeShow(shown,modelName)??observed?.model_metadata??null,passed:failureCode===null,failure_code:failureCode,warmup_http_status:warmupStatus,...(observed?{observations:observed}:{})};
}
async function main(){
 const lock=JSON.parse(await readFile('docs/sources/model-lock-v4.json','utf8')),result=await runPreflight(lock);
 await mkdir('reports/checks',{recursive:true});await writeFile('reports/checks/model-preflight-v5.json',JSON.stringify(result,null,2)+'\n');
 console.log('model_preflight '+JSON.stringify({passed:result.passed,failure_code:result.failure_code,model:result.model?.name??null,size_vram:result.model?.size_vram??null,context_length:result.model?.context_length??null,warmup_http_status:result.warmup_http_status}));
 if(!result.passed){console.error('model_preflight_failure:'+result.failure_code);process.exitCode=1;}
}
async function selfTest(){
 const modelName='qwen3:1.7b-q4_K_M',lock={ollama_version:'0.40.13',model:{name:modelName,digest:'a'.repeat(64)}},base={name:modelName,digest:lock.model.digest,size:123,size_vram:0,context_length:8192};
 function mock({digest=lock.model.digest,warmStatus=200,vram=0,license='Apache License Version 2.0',quantization='Q4_K_M',secret='private_sentinel_never_export'}={}){return async url=>{const route=url.split('/').at(-1),body=route==='version'?{version:lock.ollama_version,error:secret}:route==='tags'?{models:[{...base,digest,secret},{name:secret,digest:secret}]}:route==='ps'?{models:[{...base,size_vram:vram,reasoning:secret}]}:route==='show'?{details:{family:'qwen3',parameter_size:'1.7B',quantization_level:quantization},capabilities:['completion','tools','thinking',secret],license,reasoning:secret}:{response:secret,error:secret};return {ok:route!=='generate'||warmStatus===200,status:route==='generate'?warmStatus:200,json:async()=>body};};}
 const passed=await runPreflight(lock,{fetchImpl:mock()});assert.equal(passed.passed,true);assert.equal(passed.failure_code,null);
 const mismatch=await runPreflight(lock,{fetchImpl:mock({digest:'b'.repeat(64)})});assert.equal(mismatch.failure_code,'model_digest_changed_or_missing');assert.equal(mismatch.observations.tagged_model.digest,'b'.repeat(64));assert.equal(mismatch.warmup_http_status,null);
 const warm=await runPreflight(lock,{fetchImpl:mock({warmStatus:500})});assert.equal(warm.failure_code,'model_warmup_failed');assert.equal(warm.warmup_http_status,500);
 const gpu=await runPreflight(lock,{fetchImpl:mock({vram:123})});assert.equal(gpu.failure_code,'cpu_context_preflight_failed');assert.equal(gpu.observations.loaded_model.size_vram,123);
 const metadataFailure=await runPreflight(lock,{fetchImpl:mock({license:'private_sentinel_never_export',quantization:'Q8_0'})});assert.equal(metadataFailure.failure_code,'model_metadata_mismatch');assert.equal(metadataFailure.model_metadata.license,null);
 assert.equal(expectedMetadata({details:{family:'qwen3',parameter_size:'4.02B',quantization_level:'Q4_K_M'},capabilities:['completion','tools'],license:'Apache-2.0'},'qwen3:4b-q4_K_M'),true);
 assert.equal(expectedMetadata({details:{family:'qwen3',parameter_size:'3.99B',quantization_level:'Q4_K_M'},capabilities:['completion','tools'],license:'Apache-2.0'},'qwen3:4b-q4_K_M'),false);
 for(const result of [passed,mismatch,warm,gpu,metadataFailure])assert.equal(JSON.stringify(result).includes('private_sentinel_never_export'),false);
 const refused=await runPreflight(lock,{fetchImpl:async()=>{throw Error('database_url_and_private_key_should_not_escape');}});assert.equal(refused.failure_code,'ollama_version_request_failed');assert.equal(JSON.stringify(refused).includes('database_url'),false);
 assert.equal(preflightFailureCode('Error: arbitrary secret\nmodel_preflight_failure:model_warmup_failed\n'),'model_warmup_failed');
 assert.equal(preflightFailureCode('model_preflight_failure:arbitrary_secret\n'),null);assert.equal(preflightFailureCode('Error: model_warmup_failed'),null);
 assert.equal(safeModel({name:'private model',digest:'a'.repeat(64)},modelName),null);assert.equal(safeVersion('private 0.40.13'),null);
 for(const bad of [{...lock,model:{...lock.model,name:'unapproved:private'}},{...lock,ollama_version:'9.9.9'},{...lock,model:{...lock.model,digest:'private'}}]){assert.throws(()=>validateModelLock(bad),/model_lock_invalid/);const result=await runPreflight(bad,{fetchImpl:mock()});assert.equal(result.passed,false);assert.equal(result.failure_code,'model_lock_invalid');assert.equal(JSON.stringify(result).includes('unapproved'),false);}
 console.log('v5 model preflight diagnostic self-test passed');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv[2]==='--self-test')await selfTest();else await main().catch(()=>{console.error('model_preflight_failure:model_lock_invalid');process.exitCode=1;});}
