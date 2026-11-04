import { readFile,appendFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseV5Scope,validateV5ModelEndpoint,validateV5ModelRequest,v5Settings,V5_LIMITS,V5_TOOLS } from './configuration.js';
import { createPool } from '../../../packages/db/client.js';
import { Workflow } from '../../../packages/domain/workflow.js';
import type { Versions } from '../../../packages/domain/evidence.js';
import { ObservedSnapshots } from './snapshots.js';
import { createModelResponseDiagnostics } from './model-diagnostics.js';
const settings=v5Settings(),repositoryRoot=settings.repositoryRoot;
export const application=new Workflow(createPool(undefined,'handoff_agent'),{testMode:true});
export const allowed=[...V5_TOOLS];
export type Scope={run_id:string;case_id:string;order_id:string;capability:string;started_at:number};
let activeScope:Scope|null=null;
const observed=new Map<string,any[]>();
const snapshots=new ObservedSnapshots();
export async function observedResults(){return observed.get((await scope()).run_id)??[];}
export async function rememberFactsSnapshot(versions:Versions){return snapshots.facts((await scope()).run_id,versions);}
export async function rememberRefusedSnapshot(){return snapshots.refused((await scope()).run_id);}
export async function resolveSnapshotToken(token:string){return snapshots.resolve((await scope()).run_id,token);}
export async function beginScope(){if(activeScope)throw new Error('evaluation_busy');const next=parseV5Scope(JSON.parse(await readFile(join(repositoryRoot,'.local/model-scope-v5.json'),'utf8')));snapshots.begin(next.run_id);observed.clear();activeScope=next;}
export function endScope(){snapshots.end();observed.clear();activeScope=null;}
export async function scope():Promise<Scope>{if(!activeScope)throw new Error('no_active_evaluation');return activeScope;}
const globalState=globalThis as typeof globalThis & {handoffBudgetsV5?:Map<string,{models:number;tools:number}>};
globalState.handoffBudgetsV5??=new Map();
export async function record(type:string,data:unknown){const s=await scope();if(type==='tool_result'){const results=observed.get(s.run_id)??[];results.push(data);observed.set(s.run_id,results);}await mkdir(join(repositoryRoot,'.local/model-traces-v5'),{recursive:true});await appendFile(join(repositoryRoot,'.local/model-traces-v5',s.run_id+'.jsonl'),JSON.stringify({at:new Date().toISOString(),case_id:s.case_id,type,data})+'\n');}
export async function budget(kind:'models'|'tools'){
 const s=await scope(),counts=globalState.handoffBudgetsV5!.get(s.run_id)??{models:0,tools:0};
 if(Date.now()-s.started_at>V5_LIMITS.deadlineMs)throw new Error('case_deadline');
 if(counts[kind]>=(kind==='models'?V5_LIMITS.modelCalls:V5_LIMITS.toolCalls))throw new Error(kind+'_budget_exhausted');counts[kind]++;globalState.handoffBudgetsV5!.set(s.run_id,counts);
 await record('budget',{...counts});return s;
}
export const modelFetch:typeof fetch=async(input,init)=>{
 const currentScope=await budget('models');
 const request=JSON.parse(String(init?.body??'{}')),inventory=validateV5ModelRequest(request,settings.model.name);
 validateV5ModelEndpoint(String(input));
 // A hard output bound also covers framework versions that omit modelOptions values.
 request.max_tokens=V5_LIMITS.outputTokens;request.temperature=0;
 delete request.reasoning;
 request.reasoning_effort='none';
 const knownFields=new Set(['order_id','query','action_code','cited_clause_ids','snapshot_token','rationale']);
 const actions=new Set(['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review']);
 const tool_schema_summary=request.tools.map((tool:any)=>{const p=tool.function.parameters??{},properties=p.properties??{};return {tool:tool.function.name,properties:Object.keys(properties).filter(name=>knownFields.has(name)).sort(),required:(p.required??[]).filter((name:unknown)=>typeof name==='string'&&knownFields.has(name)).sort(),action_values:(properties.action_code?.enum??[]).filter((name:unknown)=>typeof name==='string'&&actions.has(name))};});
 await record('effective_tool_inventory',{inventory,model:request.model,max_tokens:request.max_tokens,temperature:request.temperature,reasoning_effort:request.reasoning_effort??null,tool_schema_summary});
 const response=await fetch(input,{...init,body:JSON.stringify(request),signal:AbortSignal.any([init?.signal??new AbortController().signal,AbortSignal.timeout(Math.max(1,V5_LIMITS.deadlineMs-(Date.now()-currentScope.started_at)))])});
 const diagnostics=createModelResponseDiagnostics();
 if(!response.body){await record('model_tool_admission',diagnostics.finish());return response;}
 // Inspect only bounded tool-call metadata and forward every response byte unchanged.
 const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
  transform(chunk,controller){diagnostics.write(chunk);controller.enqueue(chunk);},
  async flush(){await record('model_tool_admission',diagnostics.finish());}
 }));
 return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
};
