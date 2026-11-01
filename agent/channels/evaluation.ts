import { defineChannel,GET,POST } from 'eve/channels';
import { record,beginScope,endScope } from '../lib/runtime.js';
const traceIdentifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(value)?value:null;
function errorSummary(value:unknown){
 if(typeof value!=='string')return null;
 if(/model response ended early.*finish reason: length/i.test(value))return 'Tool not run because model output reached its token limit.';
 if(/(?:invalid|validat|schema|parse).*(?:input|argument|tool)|(?:input|argument|tool).*(?:invalid|validat|schema|parse)/i.test(value))return 'Tool input failed validation.';
 if(/(?:unknown|not found|unavailable).*(?:tool|capability)|(?:tool|capability).*(?:unknown|not found|unavailable)/i.test(value))return 'Requested tool was unavailable.';
 if(/budget|limit|deadline|timeout/i.test(value))return 'A bounded execution budget or deadline was reached.';
 if(/denied|unauthorized|forbidden|permission/i.test(value))return 'The operation was refused by an authorization boundary.';
 return 'The tool failed; raw error details are omitted.';
}
export default defineChannel({routes:[
 GET('/evaluation/info',async(request,{describe})=>{if(request.headers.get('x-evaluation-key')!==process.env.HANDOFF_EVAL_TOKEN)return new Response('Denied',{status:403});return Response.json(await describe());}),
 POST('/evaluation/run/:runId',async(request,{from,params})=>{
  if(!process.env.HANDOFF_EVAL_TOKEN||request.headers.get('x-evaluation-key')!==process.env.HANDOFF_EVAL_TOKEN)return new Response('Denied',{status:403});
  const body=await request.json() as {message:string};if(typeof body.message!=='string'||body.message.length>4000)return new Response('Invalid',{status:400});
  try{await beginScope();}catch{return new Response('Busy',{status:409});}
  try{
  const delivery=await from(params.runId!).send(body.message,{auth:null});
  await record('eve_delivery',{session_id:delivery.sessionId});
  const result=await delivery.result();await record('eve_result',{outcome:result.outcome});
  return Response.json({session_id:delivery.sessionId,outcome:result.outcome});
  }finally{endScope();}
 })],events:{
 'model.started':async(event)=>{await record('model_started',event.data);},
 'model.settled':async(event)=>{await record('model_settled',event.data);},
 'usage.recorded':async(event)=>{await record('usage_recorded',event.data);},
 'call.requested':async(event)=>{await record('eve_call_requested',event.data);},
 'call.settled':async(event)=>{const data=event.data;await record('eve_call_settled',{call_id:traceIdentifier(data.callId),outcome:['completed','failed','rejected','interrupted','abandoned'].includes(data.outcome)?data.outcome:null,error:data.error?{code:traceIdentifier(data.error.code),message:errorSummary(data.error.message)}:null});},
 'context.started':async(event)=>{await record('context_changed',event.data);}
 }});
