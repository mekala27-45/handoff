import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../packages/db/client.js';
import { Handoff } from '../../packages/domain/execution.js';
import { handler } from '../../apps/api/handler.js';
test('HTTP boundary enforces schemas, scope, CORS, no-store and full workflow',async()=>{
 const pool=createPool(),app=new Handoff(pool,{testMode:true,sessionRate:10000}),server=createServer(handler(app));
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port,base=`http://127.0.0.1:${port}`;let cap='',sid='';
 const get=async(path:string)=>fetch(base+path,{headers:cap?{authorization:`Bearer ${cap}`}:{}});
 const post=async(path:string,payload:unknown,k=randomUUID())=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':k,...(cap?{authorization:`Bearer ${cap}`}:{})},body:JSON.stringify(payload)});
 try{
  assert.equal((await get('/health')).status,200);assert.equal((await get('/ready')).status,200);assert.equal((await fetch(base+'/health',{headers:{Origin:'https://hostile.example'}})).status,403);
  assert.equal((await post('/demo/sessions',{approved:true})).status,400);
  const session=await (await post('/demo/sessions',{})).json() as any;cap=session.capability;sid=session.session_id;
  const fixtures=await (await get('/fixtures')).json() as any[];
  const r=await post('/cases',{fixture_id:fixtures.find(f=>f.title==='damage').fixture_id,source_event_id:randomUUID()});assert.equal(r.headers.get('cache-control'),'no-store');const c=await r.json() as any;
  for(const rev of [1,2])assert.equal((await post(`/cases/${c.case_id}/step`,{expected_revision:rev})).status,200);
  let view=await (await get(`/cases/${c.case_id}`)).json() as any;
  assert.equal((await post(`/cases/${c.case_id}/reviews`,{proposal_digest:view.proposal.content_digest,expected_revision:view.revision,decision:'approve',amount_cents:999})).status,400);
  await post(`/cases/${c.case_id}/reviews`,{proposal_digest:view.proposal.content_digest,expected_revision:view.revision,decision:'approve'});
  view=await (await get(`/cases/${c.case_id}`)).json() as any;const payload={proposal_digest:view.proposal.content_digest,expected_revision:view.revision},k=randomUUID();
  const a=await (await post(`/cases/${c.case_id}/execute`,payload,k)).json();const b=await (await post(`/cases/${c.case_id}/execute`,payload,k)).json();assert.deepEqual(a,b);
  assert.equal((await get('/operations/'+k)).status,200);assert.equal((await post(`/cases/${c.case_id}/execute`,{...payload,expected_revision:99},k)).status,409);
  assert.equal((await post(`/cases/${c.case_id}/fault`,{})).status,404);
 }finally{if(sid)await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=$1',[sid]);await new Promise<void>(r=>server.close(()=>r()));await pool.end();}
});
