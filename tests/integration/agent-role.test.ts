import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPool,migrate } from '../../packages/db/client.js';
test('agent role can propose but cannot approve, execute or change balances',async()=>{
 const owner=createPool();await migrate(owner);await owner.query(await readFile('packages/db/agent-role.sql','utf8'));const agent=createPool(undefined,'handoff_agent');
 try{
  assert.equal((await agent.query('SELECT current_user u')).rows[0].u,'handoff_agent');
  for(const query of ["INSERT INTO handoff.effects(session_id) VALUES('forbidden')","INSERT INTO handoff.reviews(session_id) VALUES('forbidden')","UPDATE handoff.captures SET refunded_cents=0 WHERE false","UPDATE handoff.orders SET revision=2 WHERE false","UPDATE handoff.policy_heads SET revision=2 WHERE false"]){await assert.rejects(()=>agent.query(query),(e:any)=>e.code==='42501');}
  assert.equal((await agent.query("SELECT has_table_privilege(current_user,'handoff.proposals','INSERT') allowed")).rows[0].allowed,true);
 }finally{await owner.end();await agent.end();}
});
