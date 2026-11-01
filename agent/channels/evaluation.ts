import { defineChannel,GET,POST } from 'eve/channels';
import { record,beginScope,endScope } from '../lib/runtime.js';
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
 'context.started':async(event)=>{await record('context_changed',event.data);}
 }});
