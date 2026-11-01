import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool,migrate } from '../../packages/db/client.js';
test('isolated schema persists across connections and rolls back staged writes',async()=>{
 const a=createPool(),b=createPool(),sid=`test-${randomUUID()}`;
 try {
  await migrate(a);
  await a.query("INSERT INTO handoff.demo_sessions(session_id,capability_hash,expires_at,fixture_namespace) VALUES($1,$2,clock_timestamp()+interval '1 day',$1)",[sid,randomUUID()]);
  assert.equal((await b.query('SELECT session_id FROM handoff.demo_sessions WHERE session_id=$1',[sid])).rowCount,1);
  const c=await a.connect();try{await c.query('BEGIN');await c.query('UPDATE handoff.demo_sessions SET write_count=4 WHERE session_id=$1',[sid]);await c.query('ROLLBACK');}finally{c.release();}
  assert.equal((await b.query('SELECT write_count FROM handoff.demo_sessions WHERE session_id=$1',[sid])).rows[0].write_count,0);
  await assert.rejects(a.query('UPDATE handoff.demo_sessions SET write_count=-1 WHERE session_id=$1',[sid]));
 }finally{await a.query('DELETE FROM handoff.demo_sessions WHERE session_id=$1',[sid]);await a.end();await b.end();}
});
