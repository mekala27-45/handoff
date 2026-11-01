import { readFile,appendFile,mkdir } from 'node:fs/promises';
import { createPool } from '../../packages/db/client.js';
import { Workflow } from '../../packages/domain/workflow.js';
import type { Versions } from '../../packages/domain/evidence.js';
import { ObservedSnapshots } from './snapshots.js';
import { createModelResponseDiagnostics } from './model-diagnostics.js';
export const application=new Workflow(createPool(undefined,'handoff_agent'),{testMode:true});
export const allowed=['find_policy_clauses','get_order_facts','propose_resolution'];
export type Scope={run_id:string;case_id:string;order_id:string;capability:string;started_at:number};
let activeScope:Scope|null=null;
const observed=new Map<string,any[]>();
const snapshots=new ObservedSnapshots();
export async function observedResults(){return observed.get((await scope()).run_id)??[];}
export async function rememberFactsSnapshot(versions:Versions){return snapshots.facts((await scope()).run_id,versions);}
export async function rememberRefusedSnapshot(){return snapshots.refused((await scope()).run_id);}
export async function resolveSnapshotToken(token:string){return snapshots.resolve((await scope()).run_id,token);}
export async function beginScope(){if(activeScope)throw new Error('evaluation_busy');const next=JSON.parse(await readFile('.local/model-scope.json','utf8')) as Scope;snapshots.begin(next.run_id);observed.clear();activeScope=next;}
export function endScope(){snapshots.end();observed.clear();activeScope=null;}
export async function scope():Promise<Scope>{if(!activeScope)throw new Error('no_active_evaluation');return activeScope;}
const globalState=globalThis as typeof globalThis & {handoffBudgets?:Map<string,{models:number;tools:number}>};
globalState.handoffBudgets??=new Map();
export async function record(type:string,data:unknown){const s=await scope();if(type==='tool_result'){const results=observed.get(s.run_id)??[];results.push(data);observed.set(s.run_id,results);}await mkdir('.local/model-traces',{recursive:true});await appendFile(`.local/model-traces/${s.run_id}.jsonl`,JSON.stringify({at:new Date().toISOString(),case_id:s.case_id,type,data})+'\n');}
export async function budget(kind:'models'|'tools'){
 const s=await scope(),counts=globalState.handoffBudgets!.get(s.run_id)??{models:0,tools:0};
 if(Date.now()-s.started_at>120000)throw new Error('case_deadline');
 if(counts[kind]>=(kind==='models'?4:6))throw new Error(kind+'_budget_exhausted');counts[kind]++;globalState.handoffBudgets!.set(s.run_id,counts);
 await record('budget',{...counts});return s;
}
export const modelFetch:typeof fetch=async(input,init)=>{
 const currentScope=await budget('models');
 const request=JSON.parse(String(init?.body??'{}')),inventory=(request.tools??[]).map((x:any)=>x.function?.name).sort();
 if(JSON.stringify(inventory)!==JSON.stringify(allowed))throw new Error('tool_inventory_mismatch');
 const url=String(input);if(!url.startsWith('http://127.0.0.1:11435/'))throw new Error('nonlocal_model_endpoint');
 // A hard output bound also covers framework versions that omit modelOptions values.
 request.max_tokens=512;request.temperature=0;
 if(process.env.HANDOFF_MODEL_EXPERIMENT==='v3'){
  delete request.reasoning;
  request.reasoning_effort='none';
 }
 await record('effective_tool_inventory',{inventory,model:request.model,max_tokens:request.max_tokens,temperature:request.temperature,reasoning_effort:request.reasoning_effort??null});
 const response=await fetch(input,{...init,body:JSON.stringify(request),signal:AbortSignal.any([init?.signal??new AbortController().signal,AbortSignal.timeout(Math.max(1,120000-(Date.now()-currentScope.started_at)))])});
 const diagnostics=createModelResponseDiagnostics();
 if(!response.body){await record('model_tool_admission',diagnostics.finish());return response;}
 // Inspect only bounded tool-call metadata and forward every response byte unchanged.
 const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
  transform(chunk,controller){diagnostics.write(chunk);controller.enqueue(chunk);},
  async flush(){await record('model_tool_admission',diagnostics.finish());}
 }));
 return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
};
