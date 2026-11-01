import { readdir,readFile } from 'node:fs/promises';
import { sha256,digest } from '../../packages/domain/canonical.js';
export async function modelConfiguration(){
 const files:Record<string,string>={};
 async function walk(path:string){for(const e of await readdir(path,{withFileTypes:true})){const p=path+'/'+e.name;if(e.isDirectory())await walk(p);else files[p]=sha256(await readFile(p));}}
 await walk('agent');
 return {version:2,inference_device:'cpu',gpu_backends_disabled:['CUDA','HIP','ROCm','Vulkan'],eve:'1.0.0-rc.1',model:'qwen3:0.6b',model_digest:JSON.parse(await readFile('docs/sources/model-lock.json','utf8')).model.digest,context:8192,temperature:0,turns:4,tool_calls:6,tokens_per_turn:512,deadline_ms:120000,files};
}
export async function frozenConfiguration(){const now=await modelConfiguration(),frozen=JSON.parse(await readFile('eval/plans/model-config-v2.json','utf8'));if(digest(now)!==digest(frozen.configuration))throw new Error('model_configuration_changed_after_freeze');return now;}
