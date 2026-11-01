import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModelResponseDiagnostics,MODEL_DIAGNOSTIC_LIMITS } from '../../agent/lib/model-diagnostics.js';

const encoder=new TextEncoder();
const frame=(delta:unknown)=>`data: ${JSON.stringify({id:'private-response-id',choices:[{index:0,delta}]})}\r\n\r\n`;
function read(stream:string,size=1){const parser=createModelResponseDiagnostics(),bytes=encoder.encode(stream);for(let i=0;i<bytes.length;i+=size)parser.write(bytes.subarray(i,i+size));return parser.finish();}
const proposal={action_code:'propose_refund',cited_clause_ids:['P-DAMAGE'],snapshot_token:'f1',rationale:'Damaged café delivery.'};

test('SSE diagnostics tolerate byte boundaries, split arguments and CRLF without copying content',()=>{
 const json=JSON.stringify(proposal),split=json.indexOf('café')+4;
 const stream=frame({content:'private visible content',reasoning:'private reasoning',tool_calls:[{index:0,id:'private-call-id',function:{name:'propose_resolution',arguments:json.slice(0,split)}}]})+frame({tool_calls:[{index:0,function:{arguments:json.slice(split)}}]})+'data: [DONE]\r\n\r\n';
 const summary=read(stream);
 assert.equal(summary.truncated,false);assert.equal(summary.malformed_events,0);
 assert.deepEqual(summary.tool_calls,[{index:0,tool:'propose_resolution',argument_fields:['action_code','cited_clause_ids','rationale','snapshot_token'],unknown_field_count:0,action_code:'propose_refund',citation_count:1,snapshot_token:'f1',argument_status:'valid',schema_issues:[]}]);
 const output=JSON.stringify(summary);for(const secret of ['private','café','P-DAMAGE'])assert.equal(output.includes(secret),false);
});

test('SSE diagnostics report schema paths but omit unknown keys and free-form values',()=>{
 const secret='capability-secret-value',input={...proposal,action_code:secret,cited_clause_ids:[secret,3],snapshot_token:secret,[secret]:secret};
 const summary=read(frame({tool_calls:[{index:0,function:{name:'propose_resolution',arguments:JSON.stringify(input)}}]}),7);
 const call=summary.tool_calls[0]!;assert.equal(call.argument_status,'invalid_schema');assert.equal(call.unknown_field_count,1);assert.equal(call.action_code,null);assert.equal(call.snapshot_token,null);
 assert.ok(call.schema_issues.some(issue=>issue.code==='invalid_type'&&JSON.stringify(issue.path)==='["cited_clause_ids",1]'));
 assert.equal(JSON.stringify(summary).includes(secret),false);
});

test('SSE diagnostics distinguish malformed argument JSON, unknown tools and malformed events',()=>{
 const stream='data: {broken}\n\n'+frame({tool_calls:[{index:0,function:{name:'get_order_facts',arguments:'{"order_id":'}}]})+frame({tool_calls:[{index:1,function:{name:'secret-tool-name',arguments:'{"secret-key":"secret-value"}'}}]});
 const summary=read(stream,3);assert.equal(summary.malformed_events,1);
 assert.equal(summary.tool_calls[0]?.argument_status,'invalid_json');assert.equal(summary.tool_calls[1]?.tool,'unknown');assert.equal(summary.tool_calls[1]?.argument_status,'unknown_tool');
 assert.equal(JSON.stringify(summary).includes('secret'),false);
});

test('SSE diagnostics support multiline data and ignore events after DONE',()=>{
 const parser=createModelResponseDiagnostics(),json=JSON.stringify({choices:[{index:0,delta:{tool_calls:[{index:0,function:{name:'find_policy_clauses',arguments:'{"query":"damage"}'}}]}}]});
 const comma=json.indexOf(',');parser.write(encoder.encode(`data: ${json.slice(0,comma+1)}\ndata: ${json.slice(comma+1)}\n\ndata: [DONE]\n\n${frame({tool_calls:[{index:1,function:{name:'get_order_facts',arguments:'{}'}}]})}`));
 const summary=parser.finish();assert.equal(summary.tool_calls.length,1);assert.equal(summary.tool_calls[0]?.argument_status,'valid');assert.deepEqual(parser.finish(),summary);
});

test('SSE diagnostics bound response, argument and call storage',()=>{
 const large=frame({tool_calls:[{index:0,function:{name:'get_order_facts',arguments:'x'.repeat(MODEL_DIAGNOSTIC_LIMITS.argumentBytes+1)}}]});
 const argumentsSummary=read(large,100);assert.equal(argumentsSummary.truncated,true);assert.equal(argumentsSummary.tool_calls[0]?.argument_status,'truncated');
 const callsSummary=read(frame({tool_calls:Array.from({length:20},(_,index)=>({index,function:{name:'get_order_facts',arguments:'{}'}}))}));
 assert.equal(callsSummary.tool_calls.length,MODEL_DIAGNOSTIC_LIMITS.toolCalls);assert.equal(callsSummary.dropped_calls,14);assert.equal(callsSummary.truncated,true);
 const parser=createModelResponseDiagnostics();parser.write(encoder.encode('x'.repeat(MODEL_DIAGNOSTIC_LIMITS.responseBytes+100)));parser.write(encoder.encode('more'));
 const capped=parser.finish();assert.equal(capped.response_bytes,MODEL_DIAGNOSTIC_LIMITS.responseBytes);assert.equal(capped.truncated,true);
});
