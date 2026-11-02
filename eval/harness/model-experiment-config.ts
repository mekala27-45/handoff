import { readdir,readFile } from 'node:fs/promises';
import { sha256,digest } from '../../packages/domain/canonical.js';
export async function modelConfiguration(){
 if(process.env.HANDOFF_MODEL_EXPERIMENT!=='v3')throw new Error('experiment_environment_required');
 const files:Record<string,string>={};
 const sourceHash=async(path:string)=>sha256((await readFile(path,'utf8')).replace(/\r\n/g,'\n'));
 async function walk(path:string){for(const e of await readdir(path,{withFileTypes:true})){const p=path+'/'+e.name;if(e.isDirectory())await walk(p);else files[p]=await sourceHash(p);}}
 await walk('agent');
 for(const path of ['eval/harness/model-experiment.ts','eval/harness/model-experiment-config.ts','eval/plans/model-experiment-v3.json','docs/sources/model-lock.json','docs/sources/ollama-linux-release.json','scripts/model-preflight.mjs','scripts/run-model-experiment.mjs','scripts/model-experiment-diagnostics.mjs','scripts/publish-model-evidence.mjs','scripts/freeze-model-experiment.ts','.github/workflows/model-experiment.yml'])files[path]=await sourceHash(path);
 const lock=JSON.parse(await readFile('docs/sources/model-lock.json','utf8'));
 return {version:3,experiment:'v3',tool_interface:'observed-snapshot-token-v4',workflow_guidance:'required-field-refusal-progress-v3',inference_device:'cpu',gpu_backends_disabled:['CUDA','HIP','ROCm','Vulkan'],eve:'1.0.0-rc.1',ollama:lock.ollama_version,model:'qwen3:0.6b',model_digest:lock.model.digest,context:8192,temperature:0,reasoning_effort:'none',turns:4,tool_calls:6,tokens_per_turn:512,deadline_ms:120000,files};
}
export async function frozenConfiguration(){
 const now=await modelConfiguration(),frozen=JSON.parse(await readFile('eval/plans/model-config-v3.json','utf8'));
 if(digest(now)!==frozen.configuration_digest||digest(now)!==digest(frozen.configuration))throw new Error('model_configuration_changed_after_freeze');
 return now;
}
