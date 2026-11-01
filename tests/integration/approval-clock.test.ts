import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../packages/db/client.js';
import { Handoff } from '../../packages/domain/execution.js';
import { fixtures } from '../../packages/domain/store.js';
test('approval expiry is checked after a proven business-row lock wait',async()=>{
 const pool=createPool(),observer=createPool(),waiting=createPool();waiting.options.max=1;
 const app=new Handoff(pool,{testMode:true,sessionRate:10000}),s=await app.createSession(),f=fixtures.find(f=>f.title==='damage')!,key=()=>randomUUID();let blocker:any;
 try{
  const c=await app.intake(s.capability,{fixture_id:f.fixture_id,source_event_id:key()},key());await app.step(s.capability,c.case_id,1,key());await app.step(s.capability,c.case_id,2,key());
  const v=await app.view(s.capability,c.case_id),review=await app.review(s.capability,c.case_id,{proposal_digest:v.proposal.content_digest,expected_revision:v.revision,decision:'approve'},key(),'scripted_test');
  blocker=await observer.connect();const blockerPid=(await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid;await blocker.query('BEGIN');await blocker.query('SELECT order_id FROM handoff.orders WHERE session_id=$1 FOR UPDATE',[s.session_id]);
  const pid=(await waiting.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await pool.query("UPDATE handoff.reviews SET expires_at=clock_timestamp()+interval '3 seconds' WHERE session_id=$1",[s.session_id]);
  const result=new Handoff(waiting).execute(s.capability,c.case_id,{proposal_digest:v.proposal.content_digest,expected_revision:review.revision},key());
  let observed=false;
  for(let i=0;i<30;i++){const r=(await pool.query('SELECT $2::int=ANY(pg_blocking_pids($1)) AS blocked',[pid,blockerPid])).rows[0];if(r?.blocked){observed=true;break;}await new Promise(r=>setTimeout(r,30));}
  assert.equal(observed,true,'business_lock_barrier_not_observed');
  const before=(await pool.query('SELECT expires_at>clock_timestamp() unexpired FROM handoff.reviews WHERE session_id=$1',[s.session_id])).rows[0];assert.equal(before.unexpired,true);
  await new Promise(r=>setTimeout(r,3100));await blocker.query('COMMIT');blocker.release();blocker=null;
  assert.equal((await result).code,'review_expired');assert.equal((await pool.query('SELECT count(*)::int n FROM handoff.effects WHERE session_id=$1',[s.session_id])).rows[0].n,0);
 }finally{if(blocker){await blocker.query('ROLLBACK');blocker.release();}await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=$1',[s.session_id]);await pool.end();await observer.end();await waiting.end();}
});
