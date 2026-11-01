import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Handoff } from '../../packages/domain/execution.js';
import { fixtures } from '../../packages/domain/store.js';
import { createPool,migrate } from '../../packages/db/client.js';
const key=()=>randomUUID();
export async function approved(app:Handoff,title='damage'){
 const session=await app.createSession(),f=fixtures.find(f=>f.title===title)!,{case_id}=await app.intake(session.capability,{fixture_id:f.fixture_id,source_event_id:key()},key());
 await app.step(session.capability,case_id,1,key());await app.step(session.capability,case_id,2,key());
 const view=await app.view(session.capability,case_id);
 if(view.state==='blocked')return {session,case_id,view};
 await app.review(session.capability,case_id,{proposal_digest:view.proposal.content_digest,expected_revision:view.revision,decision:'approve'},key(),'scripted_test');
 return {session,case_id,view:await app.view(session.capability,case_id)};
}
test('full effect survives concurrent requests, expiry and independent connection recovery',async()=>{
 const pool=createPool(),other=createPool();await migrate(pool);const app=new Handoff(pool,{testMode:true,sessionRate:10000});let sid='';
 try{
  const {session,case_id,view}=await approved(app);sid=session.session_id;const input={proposal_digest:view.proposal.content_digest,expected_revision:view.revision};
  const [a,b]=await Promise.all([app.execute(session.capability,case_id,input,key()),new Handoff(other).execute(session.capability,case_id,input,key())]);assert.deepEqual(a,b);
  assert.equal((await other.query('SELECT count(*)::int AS n FROM handoff.effects WHERE session_id=$1',[sid])).rows[0].n,1);
  await other.query("UPDATE handoff.reviews SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[sid]);
  assert.deepEqual(await app.execute(session.capability,case_id,input,key()),a);
  const ledger=(await other.query('SELECT amount_cents-refunded_cents AS remaining,refunded_cents-initial_refunded_cents AS delta FROM handoff.captures WHERE session_id=$1',[sid])).rows[0];assert.equal(ledger.remaining,0);assert.equal(ledger.delta,a.amount_cents);
 }finally{if(sid)await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=$1',[sid]);await pool.end();await other.end();}
});
test('approval gates refuse stale order, expired review, missing approval and rejection',async()=>{
 const pool=createPool();const app=new Handoff(pool,{testMode:true,sessionRate:10000}),ids:string[]=[];
 try{
  for(const fault of ['stale','expired','missing']){
   const {session,case_id,view}=await approved(app);ids.push(session.session_id);
   if(fault==='stale')await pool.query('UPDATE handoff.orders SET revision=revision+1 WHERE session_id=$1',[session.session_id]);
   if(fault==='expired')await pool.query("UPDATE handoff.reviews SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[session.session_id]);
   if(fault==='missing')await pool.query("UPDATE handoff.cases SET state='rejected' WHERE session_id=$1",[session.session_id]);
   const execute=()=>app.execute(session.capability,case_id,{proposal_digest:view.proposal.content_digest,expected_revision:view.revision},key());
   if(fault==='missing')await assert.rejects(execute,/approval_required/);else assert.equal((await execute()).code,fault==='stale'?'stale_approval':'review_expired');
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM handoff.effects WHERE session_id=$1',[session.session_id])).rows[0].n,0);
  }
 }finally{await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=ANY($1::text[])',[ids]);await pool.end();}
});
test('cross-session views, events, review and execute disclose no records',async()=>{
 const pool=createPool(),app=new Handoff(pool,{testMode:true,sessionRate:10000});const a=await approved(app),b=await app.createSession();
 try{
  const payload={proposal_digest:a.view.proposal.content_digest,expected_revision:a.view.revision};
  for(const call of [()=>app.view(b.capability,a.case_id),()=>app.events(b.capability,a.case_id),()=>app.review(b.capability,a.case_id,{...payload,decision:'approve'},key()),()=>app.execute(b.capability,a.case_id,payload,key())])await assert.rejects(call,/not_found/);
 }finally{await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=ANY($1::text[])',[[a.session.session_id,b.session_id]]);await pool.end();}
});
