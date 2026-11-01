import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { oracle } from '../../eval/truth/oracle.js';
import type { Fixture } from '../../packages/fixtures/types.js';
const fixtures=JSON.parse(readFileSync('packages/fixtures/data/cases.json','utf8')) as Fixture[];
const expected:{[k:string]:[string,string,number]}={damage:['propose_refund','P-DAMAGE',1],delay:['draft_escalation','P-DELAY',0],'cancel before':['propose_refund','P-CANCEL-BEFORE',1],'cancel after':['draft_manual_review','P-CANCEL-AFTER',0],duplicate:['propose_refund','P-DUPLICATE',1],'outside window':['draft_manual_review','P-WINDOW',0],identity:['request_identity_review','P-IDENTITY',0],refunded:['draft_confirmation','P-REFUNDED',0]};
test('sixteen golden decisions have manually stated dispositions and invariants',()=>{
  for(const [name,[action,clause,count]] of Object.entries(expected)) {
    const examples=fixtures.filter(f=>f.title===name&&f.order.captured_cents<10).slice(0,2);
    assert.equal(examples.length,2);
    for(const f of examples){const t=oracle(f); assert.equal(t.action,action);assert.equal(t.clause,clause);assert.equal(t.effect_count,count);assert.equal(t.amount_cents,count?1:0);}
  }
});
test('split, opaque identities, balanced subset and nonempty fixture coverage',()=>{
  const plan=JSON.parse(readFileSync('eval/plans/registered.json','utf8'));
  assert.equal(fixtures.length,160);assert.equal(new Set(fixtures.map(x=>x.fixture_id)).size,160);
  assert.equal(plan.cases.filter((x:any)=>x.split==='held-out').length,80);
  assert.equal(plan.model_subset.length,16);
  for(const family of new Set(plan.cases.map((x:any)=>x.family)))assert.equal(plan.cases.filter((x:any)=>x.family===family&&plan.model_subset.includes(x.fixture_id)).length,2);
  assert.ok(fixtures.every(x=>/^fx_[a-f0-9]{20}$/.test(x.fixture_id)));
});
