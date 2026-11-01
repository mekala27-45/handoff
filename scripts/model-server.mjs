import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),profile=path.join(root,'.local/model-runtime/profile');await mkdir(profile,{recursive:true});
const binary=process.platform==='win32'?path.join(root,'.local/model-runtime/ollama/ollama.exe'):'ollama';
const p=spawn(binary,['serve'],{windowsHide:true,stdio:'inherit',env:{...process.env,USERPROFILE:profile,OLLAMA_HOST:'127.0.0.1:11435',OLLAMA_MODELS:path.join(root,'.local/models'),OLLAMA_NO_CLOUD:'1',OLLAMA_CONTEXT_LENGTH:'8192',OLLAMA_KEEP_ALIVE:'30m',OLLAMA_NUM_PARALLEL:'1',OLLAMA_MAX_LOADED_MODELS:'1',CUDA_VISIBLE_DEVICES:'-1',HIP_VISIBLE_DEVICES:'-1',ROCR_VISIBLE_DEVICES:'-1',GGML_VK_VISIBLE_DEVICES:'-1',OLLAMA_VULKAN:'0'}});
p.on('error',()=>{console.error('Pinned Ollama binary unavailable. See docs/RUNBOOK.md.');process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>p.kill());p.on('exit',code=>process.exitCode=code??1);
