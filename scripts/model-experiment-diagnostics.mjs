import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// This module deliberately builds a new object from an allowlist. Never include
// raw error text, model output, input, reasoning, call IDs or arbitrary metadata.
const TOOLS=new Set(['get_order_facts','find_policy_clauses','propose_resolution']);
const FINISH=new Set(['stop','length','content-filter','content_filter','tool-calls','tool_calls','error','other','unknown']);
const OUTCOME=new Set(['completed','failed','rejected','interrupted','abandoned']);
const RUNTIME_OUTCOME=new Set(['handled','unhandled','failed','interrupted','completed','abandoned']);
// These codes are present in the pinned Eve harness, not inferred error text.
const ERROR_CODES=new Set(['ACTION_RESULT_FAILED','COMPACTION_FAILED','INVALID_TOOL_INPUT','MODEL_CALL_FAILED','MODEL_SELECTION_FAILED','OUTPUT_SCHEMA_NOT_FULFILLED','SESSION_USAGE_LIMIT_REACHED','TASK_FAILED','TOOL_EXECUTION_DENIED','WORKFLOW_STREAM_WRITE_FAILED']);
const MAX_CASES=32,MAX_MODELS=16,MAX_CALLS=32,MAX_EVENTS=4096,MAX_FILES=256;
const fixture=value=>typeof value==='string'&&/^fx_[a-f0-9]{20}$/.test(value)?value:null;
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(value)?value:null;
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000_000?value:null;
const tool=value=>TOOLS.has(value)?value:null;
const enumValue=(values,value)=>values.has(value)?value:null;
function errorCategory(value,code){
 if(code==='INVALID_TOOL_INPUT')return 'invalid_tool_input';
 if(code==='TOOL_EXECUTION_DENIED')return 'authorization_denied';
 if(code==='SESSION_USAGE_LIMIT_REACHED')return 'execution_limit';
 if(typeof value!=='string')return code?'other_error':null;
 if(/model response ended early.*finish reason: length|model output reached its token limit/i.test(value))return 'model_output_limit';
 if(/(?:invalid|validat|schema|parse).*(?:input|argument|tool)|(?:input|argument|tool).*(?:invalid|validat|schema|parse)/i.test(value))return 'invalid_tool_input';
 if(/(?:unknown|not found|unavailable).*(?:tool|capability)|(?:tool|capability).*(?:unknown|not found|unavailable)/i.test(value))return 'tool_unavailable';
 if(/budget|limit|deadline|timeout|timed out/i.test(value))return 'execution_limit';
 if(/denied|unauthorized|forbidden|permission|authorization boundary/i.test(value))return 'authorization_denied';
 if(/cpu_model_preflight_failed/i.test(value))return 'cpu_preflight_failed';
 if(/fetch failed|network|request failed/i.test(value))return 'request_failed';
 return 'other_error';
}
function emptyCase(id){return {id,row:null,events:null};}
function safeRow(row){
 const result={};
 for(const name of ['proposal_correct','evidence_valid','unsafe_proposal','unclassified','terminal_record'])if(typeof row[name]==='boolean')result[name]=row[name];
 for(const name of ['model_calls','tool_requests','framework_tool_requests'])if(count(row[name])!==null)result[name]=row[name];
 if(row.error!==undefined)result.case_error_category=errorCategory(row.error,null);
 const runtime=enumValue(RUNTIME_OUTCOME,row.runtime_result?.outcome);if(runtime)result.runtime_outcome=runtime;
 return result;
}
function summarizeCase(item){
 const events=item.events??[],models=new Map(),calls=new Map(),names=new Set(),settled=[],usage=new Map();
 let started=0,inventories=0,toolRequests=0,frameworkRequests=0,truncated=events.length>MAX_EVENTS;
 function addTool(value){const name=tool(value);if(name)names.add(name);return name;}
 for(const event of events.slice(0,MAX_EVENTS)){
  if(!event||typeof event!=='object')continue;const d=event.data;if(!d||typeof d!=='object')continue;
  if(event.type==='model_started')started++;
  if(event.type==='effective_tool_inventory')inventories++;
  if(event.type==='model_tool_request'){toolRequests++;addTool(d.tool);}
  if(event.type==='tool_result')addTool(d.tool);
  if(event.type==='eve_call_requested'){
   frameworkRequests++;const name=addTool(d.capability?.name??d.capability),id=identifier(d.callId??d.call_id);
   if(id&&calls.size<MAX_CALLS)calls.set(id,name);else if(id)truncated=true;
  }
  if(event.type==='model_settled'){
   if(models.size>=MAX_MODELS){truncated=true;continue;}
   const id=identifier(d.runId)??'anonymous_'+models.size;
   models.set(id,{finish_reason:enumValue(FINISH,d.finishReason)??'unknown',outcome:enumValue(OUTCOME,d.outcome)});
  }
  if(event.type==='usage_recorded'&&d.kind==='model'){
   const id=identifier(d.owner?.runId);if(!id)continue;
   if(usage.size>=MAX_MODELS&&!usage.has(id)){truncated=true;continue;}
   const values={};for(const [from,to] of [['inputTokens','input_tokens'],['outputTokens','output_tokens'],['cacheReadTokens','cache_read_tokens'],['cacheWriteTokens','cache_write_tokens']])values[to]=count(d.usage?.[from]);
   usage.set(id,values);
  }
  if(event.type==='eve_call_settled'){
   if(settled.length>=MAX_CALLS){truncated=true;continue;}
   const id=identifier(d.call_id??d.callId),rawCode=d.error?.code,code=ERROR_CODES.has(rawCode)?rawCode:(d.error?'other_error':null);
   settled.push({id,tool:tool(d.tool),outcome:enumValue(OUTCOME,d.outcome),error_code:code,error_category:d.error?errorCategory(d.error.message,code):null});
  }
 }
 const row=item.row??{};
 return {fixture_id:item.id,...row,model_calls:row.model_calls??Math.max(started,inventories,models.size),tool_requests:row.tool_requests??toolRequests,framework_tool_requests:row.framework_tool_requests??frameworkRequests,
  tool_names:[...names].sort(),model_settled:[...models].map(([id,value])=>({...value,...(usage.get(id)??{input_tokens:null,output_tokens:null,cache_read_tokens:null,cache_write_tokens:null})})),
  unmatched_usage_count:[...usage.keys()].filter(id=>!models.has(id)).length,
  call_settled:settled.map(({id,...value})=>({...value,tool:value.tool??calls.get(id)??null})),truncated};
}
export function summarizeModelExperiment(entries){
 if(!Array.isArray(entries))throw Error('diagnostic_entries_required');
 const cases=new Map();let parsed=0,parseFailures=0,ignored=0,truncated=entries.length>MAX_FILES;
 function getCase(id){if(!id)return null;if(!cases.has(id)){if(cases.size>=MAX_CASES){truncated=true;return null;}cases.set(id,emptyCase(id));}return cases.get(id);}
 for(const entry of entries.slice(0,MAX_FILES)){
  const file=typeof entry?.file==='string'?entry.file.replaceAll('\\','/'):'',text=entry?.text;
  if(!/^reports\/(?:model-traces|runs)\/model-(?:development|heldout)-v\d+-\d+(?:-fx_[a-f0-9]{20}|-cases|-progress)?\.json$/.test(file)||typeof text!=='string'){ignored++;continue;}
  if(text.length>2_000_000){parseFailures++;truncated=true;continue;}
  let value;try{value=JSON.parse(text);parsed++;}catch{parseFailures++;continue;}
  if(Array.isArray(value)){
   for(const row of value.slice(0,MAX_CASES)){const item=getCase(fixture(row?.fixture_id));if(item)item.row=safeRow(row);}
   if(value.length>MAX_CASES)truncated=true;
  }else if(value&&typeof value==='object'&&Array.isArray(value.trace)){
   const id=fixture(typeof value.run_id==='string'?value.run_id.match(/(fx_[a-f0-9]{20})$/)?.[1]:null)??fixture(file.match(/-(fx_[a-f0-9]{20})\.json$/)?.[1]);
   const item=getCase(id);if(item)item.events=value.trace;
  }
 }
 const result=[...cases.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(summarizeCase);
 return {schema_version:1,case_count:result.length,parsed_files:parsed,parse_failures:parseFailures,ignored_files:ignored,truncated:truncated||result.some(row=>row.truncated),cases:result};
}
function selfTest(){
 const id='fx_0123456789abcdefabcd',secret='must_never_leave_the_trace_927438';
 const trace={run_id:'model-development-v3-1-'+id,reasoning:secret,trace:[
  {type:'eve_call_requested',data:{callId:'call_1',capability:{name:'get_order_facts'},input:{secret}}},
  {type:'model_settled',data:{runId:'run_0',finishReason:'length',outcome:'completed',reasoning:secret}},
  {type:'usage_recorded',data:{kind:'model',owner:{runId:'run_0'},usage:{inputTokens:11,outputTokens:512,cacheReadTokens:3,cacheWriteTokens:-1}}},
  {type:'eve_call_settled',data:{call_id:'call_1',outcome:'failed',error:{code:'INVALID_TOOL_INPUT',message:secret}}},
  {type:'eve_call_settled',data:{call_id:'call_2',outcome:secret,error:{code:secret,message:'Tool not run because model output reached its token limit. '+secret}}},
  {type:'model_tool_request',data:{tool:secret,input:secret}},
  {type:'model_settled',data:{runId:'run_1',finishReason:secret,outcome:secret}}
 ]};
 const result=summarizeModelExperiment([{file:`reports/model-traces/model-development-v3-1-${id}.json`,text:JSON.stringify(trace)},{file:'reports/runs/model-development-v3-1-cases.json',text:JSON.stringify([{fixture_id:id,proposal_correct:false,error:secret,model_calls:4,tool_requests:1,arbitrary:secret}])}]);
 assert.equal(result.case_count,1);const row=result.cases[0];assert.equal(row.model_calls,4);assert.deepEqual(row.tool_names,['get_order_facts']);assert.equal(row.model_settled[0].output_tokens,512);assert.equal(row.model_settled[0].cache_write_tokens,null);assert.equal(row.call_settled[0].tool,'get_order_facts');assert.equal(row.call_settled[0].error_code,'INVALID_TOOL_INPUT');assert.equal(row.call_settled[1].error_code,'other_error');assert.equal(row.call_settled[1].error_category,'model_output_limit');assert.equal(row.model_settled[1].finish_reason,'unknown');assert.equal(JSON.stringify(result).includes(secret),false);
 assert.equal(summarizeModelExperiment([]).case_count,0);
 assert.equal(summarizeModelExperiment([{file:'reports/model-traces/model-development-v3-1-progress.json',text:'invalid'}]).parse_failures,1);
 const bounded=summarizeModelExperiment([{file:`reports/model-traces/model-development-v3-1-${id}.json`,text:JSON.stringify({...trace,trace:Array.from({length:MAX_EVENTS+1},()=>({type:'model_settled',data:{finishReason:'length'}}))})}]);
 assert.equal(bounded.truncated,true);assert.equal(bounded.cases[0].model_settled.length,MAX_MODELS);
 console.log('model experiment diagnostic self-test passed');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.length!==3||process.argv[2]!=='--self-test')throw Error('use_self_test_or_import_diagnostics');selfTest();}
