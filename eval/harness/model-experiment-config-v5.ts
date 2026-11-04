import { readdir,readFile } from 'node:fs/promises';
import { sha256,digest } from '../../packages/domain/canonical.js';
export async function modelConfiguration(){
 if(process.env.HANDOFF_MODEL_EXPERIMENT!=='v5')throw new Error('v5_environment_required');
 const files:Record<string,string>={};
 const sourceHash=async(path:string)=>sha256((await readFile(path,'utf8')).replace(/\r\n/g,'\n'));
 async function walk(path:string){for(const e of await readdir(path,{withFileTypes:true})){const p=path+'/'+e.name;if(e.isDirectory())await walk(p);else files[p]=await sourceHash(p);}}
 await walk('agent-v5/agent');await walk('agent-v5/packages/fixtures/data');
 for(const path of ['agent-v5/package.json','agent-v5/packages/fixtures/LICENSE','tsconfig.agent-v5.json','tsconfig.json','package.json','package-lock.json','eval/harness/model-experiment-v5.ts','eval/harness/authority-audit-v4.ts','eval/harness/verify-recorded-v5.ts','tests/integration/authority-v4.test.ts','eval/harness/model-experiment-config-v5.ts','eval/plans/model-experiment-v5.json','docs/sources/model-lock-v4.json','docs/sources/ollama-linux-release.json','scripts/model-preflight-v5.mjs','scripts/run-model-experiment-v5.mjs','scripts/model-experiment-diagnostics.mjs','scripts/publish-model-evidence-v5.mjs','eval/harness/model-selection-v5.ts','tests/unit/model-v5.test.ts','.github/workflows/model-experiment-v5.yml'])files[path]=await sourceHash(path);
 const lock=JSON.parse(await readFile('docs/sources/model-lock-v4.json','utf8'));
 if(!['qwen3:1.7b-q4_K_M','qwen3:4b-q4_K_M'].includes(lock.model.name)||!/^[a-f0-9]{64}$/.test(lock.model.digest)||lock.ollama_version!=='0.40.13')throw new Error('verified_v5_model_lock_required');
 return {version:5,experiment:'v5',agent_project:'agent-v5',tool_interface:'observed-snapshot-token-v5',workflow_guidance:'policy-topic-and-predicate-v5',prompt_identity:'internal-case-uuid-omitted-v1',inference_device:'cpu',gpu_backends_disabled:['CUDA','HIP','ROCm','Vulkan'],eve:'1.0.0-rc.1',ollama:lock.ollama_version,model:lock.model.name,model_digest:lock.model.digest,context:8192,temperature:0,reasoning_effort:'none',turns:4,tool_calls:6,tokens_per_turn:512,deadline_ms:120000,files};
}
export async function frozenConfiguration(){const now=await modelConfiguration(),frozen=JSON.parse(await readFile('eval/plans/model-config-v5.json','utf8'));if(digest(now)!==frozen.configuration_digest||digest(now)!==digest(frozen.configuration))throw new Error('v5_configuration_changed_after_freeze');return now;}
