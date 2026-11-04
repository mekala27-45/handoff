import { readFileSync } from 'node:fs';
import { isAbsolute,join,resolve } from 'node:path';

export const V5_MODEL_NAMES=['qwen3:1.7b-q4_K_M','qwen3:4b-q4_K_M'] as const;
export const V5_LIMITS={context:8192,modelCalls:4,toolCalls:6,outputTokens:512,deadlineMs:120000} as const;
export const V5_TOOLS=['find_policy_clauses','get_order_facts','propose_resolution'] as const;
export type V5ModelLock={ollama_version:'0.40.13';model:{name:typeof V5_MODEL_NAMES[number];digest:string}};

export function parseV5ModelLock(value:unknown):V5ModelLock {
 if(!value||typeof value!=='object')throw new Error('v5_model_lock_required');
 const lock=value as {ollama_version?:unknown;model?:{name?:unknown;digest?:unknown}};
 if(lock.ollama_version!=='0.40.13'||!V5_MODEL_NAMES.some(name=>name===lock.model?.name)||typeof lock.model?.digest!=='string'||!/^[a-f0-9]{64}$/.test(lock.model.digest))throw new Error('v5_model_lock_invalid');
 return {ollama_version:'0.40.13',model:{name:lock.model.name as V5ModelLock['model']['name'],digest:lock.model.digest}};
}

export function v5RepositoryRoot(cwd:string,repositoryRoot:string|undefined,experiment:string|undefined):string {
 if(experiment!=='v5'||!repositoryRoot||!isAbsolute(repositoryRoot))throw new Error('v5_runtime_environment_required');
 const root=resolve(repositoryRoot),expected=join(root,'agent-v5');
 const normalized=(value:string)=>process.platform==='win32'?value.toLowerCase():value;
 if(normalized(resolve(cwd))!==normalized(expected))throw new Error('v5_project_directory_required');
 return root;
}

export function assertV5FixtureCopies(root:string){
 for(const file of ['data/cases.json','data/policy.json','LICENSE']){
  const original=readFileSync(join(root,'packages/fixtures',file));
  const copy=readFileSync(join(root,'agent-v5/packages/fixtures',file));
  if(!original.equals(copy))throw new Error('v5_synthetic_fixture_copy_mismatch');
 }
}

export function v5Settings(){
 const repositoryRoot=v5RepositoryRoot(process.cwd(),process.env.HANDOFF_V5_REPO_ROOT,process.env.HANDOFF_MODEL_EXPERIMENT);
 assertV5FixtureCopies(repositoryRoot);
 const lock=parseV5ModelLock(JSON.parse(readFileSync(join(repositoryRoot,'docs/sources/model-lock-v4.json'),'utf8')));
 return {repositoryRoot,...lock};
}

export function validateV5ModelRequest(request:{model?:unknown;tools?:Array<{function?:{name?:unknown}}>},modelName:V5ModelLock['model']['name']){
 const inventory=(request.tools??[]).map(tool=>tool.function?.name).sort();
 if(request.model!==modelName)throw new Error('v5_model_selection_mismatch');
 if(JSON.stringify(inventory)!==JSON.stringify(V5_TOOLS))throw new Error('tool_inventory_mismatch');
 return inventory;
}

export function validateV5ModelEndpoint(input:string){
 const url=new URL(input);
 if(url.origin!=='http://127.0.0.1:11435'||url.username||url.password)throw new Error('nonlocal_model_endpoint');
}

export type V5Scope={run_id:string;case_id:string;order_id:string;capability:string;started_at:number};
export function parseV5Scope(value:unknown):V5Scope {
 const scope=value as Partial<V5Scope>|null;
 if(!scope||typeof scope.run_id!=='string'||!/^model-(?:development|heldout)-v5-\d+-fx_[a-f0-9]{20}$/.test(scope.run_id)||typeof scope.case_id!=='string'||!/^case_[A-Za-z0-9_-]{1,90}$/.test(scope.case_id)||typeof scope.order_id!=='string'||scope.order_id.length>100||!scope.order_id||typeof scope.capability!=='string'||scope.capability.length<32||scope.capability.length>256||!Number.isSafeInteger(scope.started_at)||scope.started_at!<=0)throw new Error('v5_scope_invalid');
 return {run_id:scope.run_id,case_id:scope.case_id,order_id:scope.order_id,capability:scope.capability,started_at:scope.started_at!};
}
