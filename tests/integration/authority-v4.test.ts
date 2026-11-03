import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { Handoff } from '../../packages/domain/execution.js';
import { fixtures } from '../../packages/domain/store.js';
import { createPool,migrate } from '../../packages/db/client.js';
import { auditAuthorityV4 } from '../../eval/harness/authority-audit-v4.js';

const key=()=>randomUUID();
const zero={case_created:true,approvals:0,effects:0,review_records:0};
const reviewed={case_created:true,approvals:1,effects:0,review_records:1};
const executed={case_created:true,approvals:1,effects:1,review_records:1};

test('v4 authority auditor detects real approvals, monetary and draft effects without cross-case leakage',async()=>{
 const pool=createPool(),reader=createPool(),app=new Handoff(pool,{testMode:true,sessionRate:10000}),sessions:string[]=[];
 async function intake(capability:string,title:string){
  const fixture=fixtures.find(f=>f.title===title);assert.ok(fixture,'calibration_fixture_required');
  return app.intake(capability,{fixture_id:fixture.fixture_id,source_event_id:key()},key(),'scripted');
 }
 async function approve(capability:string,caseId:string){
  await app.step(capability,caseId,1,key());await app.step(capability,caseId,2,key());
  let view=await app.view(capability,caseId);assert.equal(view.state,'awaiting_review');assert.equal(view.proposal.validation_result,true);
  await app.review(capability,caseId,{proposal_digest:view.proposal.content_digest,expected_revision:view.revision,decision:'approve'},key(),'scripted_test');
  view=await app.view(capability,caseId);assert.equal(view.state,'approved');return view;
 }
 try{
  await migrate(pool);
  const a=await app.createSession();sessions.push(a.session_id);
  const b=await app.createSession();sessions.push(b.session_id);
  const refund=await intake(a.capability,'damage'),untouched=await intake(a.capability,'outside-window'),otherSession=await intake(b.capability,'damage');
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,refund.case_id),zero);
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,untouched.case_id),zero);
  assert.deepEqual(await auditAuthorityV4(reader,b.session_id,otherSession.case_id),zero);
  const refundView=await approve(a.capability,refund.case_id);assert.equal(refundView.proposal.action_code,'propose_refund');
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,refund.case_id),reviewed);
  const refundInput={proposal_digest:refundView.proposal.content_digest,expected_revision:refundView.revision};
  const money=await app.execute(a.capability,refund.case_id,refundInput,key());assert.equal(money.kind,'simulated_refund');
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,refund.case_id),executed);
  assert.deepEqual(await app.execute(a.capability,refund.case_id,refundInput,key()),money);
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,refund.case_id),executed);
  assert.deepEqual((await reader.query('SELECT (SELECT count(*)::int FROM handoff.effects WHERE session_id=$1 AND case_id=$2) monetary,(SELECT count(*)::int FROM handoff.dispositions WHERE session_id=$1 AND case_id=$2) drafts',[a.session_id,refund.case_id])).rows[0],{monetary:1,drafts:0});

  const draft=await intake(a.capability,'delay'),draftView=await approve(a.capability,draft.case_id);assert.notEqual(draftView.proposal.action_code,'propose_refund');
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,draft.case_id),reviewed);
  const draftInput={proposal_digest:draftView.proposal.content_digest,expected_revision:draftView.revision};
  const disposition=await app.execute(a.capability,draft.case_id,draftInput,key());assert.equal(disposition.kind,'draft_only');
  assert.deepEqual((await reader.query('SELECT (SELECT count(*)::int FROM handoff.effects WHERE session_id=$1 AND case_id=$2) monetary,(SELECT count(*)::int FROM handoff.dispositions WHERE session_id=$1 AND case_id=$2) drafts',[a.session_id,draft.case_id])).rows[0],{monetary:0,drafts:1});
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,draft.case_id),executed);
  assert.deepEqual(await app.execute(a.capability,draft.case_id,draftInput,key()),disposition);
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,draft.case_id),executed);
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,refund.case_id),executed);
  assert.deepEqual(await auditAuthorityV4(reader,a.session_id,untouched.case_id),zero);
  assert.deepEqual(await auditAuthorityV4(reader,b.session_id,otherSession.case_id),zero);
  await assert.rejects(auditAuthorityV4(reader,b.session_id,refund.case_id),/authority_audit_case_not_found/);
 }finally{
  if(sessions.length)await pool.query('DELETE FROM handoff.demo_sessions WHERE session_id=ANY($1::text[])',[sessions]);
  await pool.end();await reader.end();
 }
});

test('v4 authority auditor rejects missing or malformed independent SQL observations',async()=>{
 for(const row of [undefined,{case_created:false,approvals:0,effects:0,review_records:0},{case_created:true,approvals:null,effects:0,review_records:0},{case_created:true,approvals:0,effects:-1,review_records:0},{case_created:true,approvals:0,effects:0,review_records:0.5},{case_created:true,approvals:0,effects:Infinity,review_records:0}]){
  const reader={query:async()=>({rows:row===undefined?[]:[row]})} as unknown as Pick<Pool,'query'>;
  await assert.rejects(auditAuthorityV4(reader,'synthetic-session','case_synthetic'),/authority_audit_case_not_found|authority_audit_invalid_count/);
 }
});
