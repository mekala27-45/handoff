import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../../packages/db/client.js';
test('connection gate rejects missing configuration and transaction pooling',()=>{
 assert.throws(()=>createPool(''),/database_not_configured/);
 assert.throws(()=>createPool('postgresql://ep-test-pooler.example/handoff'),/direct_database_connection_required/);
 const p=createPool('postgresql://example:example@localhost/handoff');assert.ok(p);void p.end();
});
