import { orderFactsInputSchema,policySearchInputSchema,proposalInputSchema } from './tool-schemas.js';

export const MODEL_DIAGNOSTIC_LIMITS={responseBytes:65536,argumentBytes:8192,toolCalls:6,issues:8} as const;
const schemas={get_order_facts:orderFactsInputSchema,find_policy_clauses:policySearchInputSchema,propose_resolution:proposalInputSchema};
type ToolName=keyof typeof schemas;
const fields=new Set(['order_id','query','action_code','cited_clause_ids','snapshot_token','rationale']);
const actions=new Set(['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review']);
const issueCodes=new Set(['invalid_type','too_big','too_small','invalid_format','not_multiple_of','unrecognized_keys','invalid_union','invalid_key','invalid_element','invalid_value','custom']);
type SafeIssue={code:string;path:(string|number)[]};
export type SafeToolCallSummary={index:number;tool:ToolName|'unknown';argument_fields:string[];unknown_field_count:number;action_code:string|null;citation_count:number|null;snapshot_token:string|null;argument_status:'valid'|'invalid_schema'|'invalid_json'|'truncated'|'unknown_tool';schema_issues:SafeIssue[]};
export type SafeModelResponseSummary={response_bytes:number;truncated:boolean;malformed_events:number;dropped_calls:number;tool_calls:SafeToolCallSummary[]};
type CallBuffer={name:string;arguments:string;argumentBytes:number;truncated:boolean};
const encoder=new TextEncoder();

function summarize(index:number,call:CallBuffer):SafeToolCallSummary {
 const tool=Object.hasOwn(schemas,call.name)?call.name as ToolName:'unknown';
 const result:SafeToolCallSummary={index,tool,argument_fields:[],unknown_field_count:0,action_code:null,citation_count:null,snapshot_token:null,argument_status:'invalid_json',schema_issues:[]};
 if(call.truncated){result.argument_status='truncated';return result;}
 let input:unknown;
 try{input=JSON.parse(call.arguments);}catch{return result;}
 if(input!==null&&typeof input==='object'&&!Array.isArray(input)){
  const data=input as Record<string,unknown>,keys=Object.keys(data);
  result.argument_fields=keys.filter(key=>fields.has(key)).sort();
  result.unknown_field_count=Math.min(64,keys.filter(key=>!fields.has(key)).length);
  result.action_code=typeof data.action_code==='string'&&actions.has(data.action_code)?data.action_code:null;
  result.citation_count=Array.isArray(data.cited_clause_ids)?Math.min(64,data.cited_clause_ids.length):null;
  result.snapshot_token=typeof data.snapshot_token==='string'&&/^[fr][1-6]$/.test(data.snapshot_token)?data.snapshot_token:null;
 }
 if(tool==='unknown'){result.argument_status='unknown_tool';return result;}
 const validation=schemas[tool].safeParse(input);
 result.argument_status=validation.success?'valid':'invalid_schema';
 if(!validation.success)result.schema_issues=validation.error.issues.slice(0,MODEL_DIAGNOSTIC_LIMITS.issues).map(issue=>({code:issueCodes.has(issue.code)?issue.code:'other',path:issue.path.slice(0,4).map(part=>typeof part==='number'&&Number.isSafeInteger(part)&&part>=0&&part<64?part:typeof part==='string'&&fields.has(part)?part:'unknown')}));
 return result;
}

// Observe a byte stream without returning its text, reasoning, provider IDs or free-form values.
export function createModelResponseDiagnostics(){
 const decoder=new TextDecoder(),calls=new Map<number,CallBuffer>();
 let responseBytes=0,truncated=false,malformedEvents=0,droppedCalls=0,buffer='',data:string[]=[],done=false,finished=false;
 let cached:SafeModelResponseSummary|undefined;
 function event(){
  if(data.length===0)return;
  const payload=data.join('\n');data=[];
  if(payload==='[DONE]'){done=true;return;}
  let parsed:any;
  try{parsed=JSON.parse(payload);}catch{malformedEvents++;return;}
  if(!Array.isArray(parsed?.choices))return;
  // This runtime requests one completion. Other choices cannot name its admitted calls.
  const choice=parsed.choices.find((entry:any)=>entry?.index===0)??parsed.choices[0];
  const deltas=choice?.delta?.tool_calls;
  if(!Array.isArray(deltas))return;
  for(const delta of deltas){
   const index=delta?.index;
   if(!Number.isSafeInteger(index)||index<0||index>=MODEL_DIAGNOSTIC_LIMITS.toolCalls){droppedCalls++;truncated=true;continue;}
   let call=calls.get(index);
   if(!call){call={name:'',arguments:'',argumentBytes:0,truncated:false};calls.set(index,call);}
   const name=delta?.function?.name;
   if(typeof name==='string')call.name=(call.name+name).slice(0,80);
   const argument=delta?.function?.arguments;
   if(typeof argument!=='string'||call.truncated)continue;
   const byteLength=encoder.encode(argument).byteLength;
   if(call.argumentBytes+byteLength>MODEL_DIAGNOSTIC_LIMITS.argumentBytes){call.truncated=true;call.arguments='';truncated=true;continue;}
   call.argumentBytes+=byteLength;call.arguments+=argument;
  }
 }
 function line(value:string){
  if(done)return;
  if(value.endsWith('\r'))value=value.slice(0,-1);
  if(value===''){event();return;}
  if(value==='data')data.push('');
  else if(value.startsWith('data:'))data.push(value.slice(value[5]===' '?6:5));
 }
 function text(value:string){
  buffer+=value;let newline:number;
  while((newline=buffer.indexOf('\n'))>=0){line(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}
 }
 return {
  write(chunk:Uint8Array){
   if(finished||done)return;
   const remaining=MODEL_DIAGNOSTIC_LIMITS.responseBytes-responseBytes;
   if(remaining<=0){truncated=true;return;}
   const accepted=chunk.subarray(0,remaining);responseBytes+=accepted.byteLength;
   if(accepted.byteLength<chunk.byteLength)truncated=true;
   text(decoder.decode(accepted,{stream:true}));
  },
  finish():SafeModelResponseSummary {
   if(cached)return structuredClone(cached);
   finished=true;text(decoder.decode());if(buffer!=='')line(buffer);buffer='';if(!done)event();
   cached={response_bytes:responseBytes,truncated,malformed_events:malformedEvents,dropped_calls:droppedCalls,tool_calls:[...calls].sort(([a],[b])=>a-b).map(([index,call])=>summarize(index,call))};
   return structuredClone(cached);
  }
 };
}
