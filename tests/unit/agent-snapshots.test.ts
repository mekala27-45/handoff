import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObservedSnapshots } from '../../agent/lib/snapshots.js';
import { snapshotVersions,reference } from '../../packages/domain/evidence.js';
import { validateProposal } from '../../packages/domain/policy.js';
import { policy } from '../../packages/fixtures/policy.js';
import type { Fixture } from '../../packages/fixtures/types.js';

const fixture:Fixture={fixture_id:'snapshot-unit',title:'snapshot unit',ticket:'My delivered item arrived damaged.',received_at:'2026-06-10T00:00:00.000Z',trusted_customer_id:'customer-unit',issue:'damage',order:{order_id:'order-unit',customer_id:'customer-unit',currency:'USD',captured_cents:1200,refunded_cents:0,shipping_state:'delivered',delivered_at:'2026-06-09T00:00:00.000Z',shipped_at:'2026-06-08T00:00:00.000Z',tracking:'tracking-unit',revision:1},captures:[{capture_id:'capture-unit',amount_cents:1200,refunded_cents:0,revision:1,confirmed_at:'2026-06-07T00:00:00.000Z',duplicate:false}],existing_effect_ref:null};

test('snapshot tokens require an observation and preserve detached full versions',()=>{
 const snapshots=new ObservedSnapshots();snapshots.begin('run-a');
 assert.throws(()=>snapshots.resolve('run-a','f1'),/unknown_snapshot_token/);
 const versions=snapshotVersions(fixture,policy,1),original=structuredClone(versions);
 const token=snapshots.facts('run-a',versions);assert.equal(token,'f1');
 versions.order_revision=99;versions.capture_versions['capture-unit']=99;
 const observed=snapshots.resolve('run-a',token);assert.equal(observed.kind,'facts');
 if(observed.kind!=='facts')throw new Error('expected_facts');
 assert.deepEqual(observed.versions,original);
 observed.versions.policy_digest='changed';
 assert.deepEqual(snapshots.resolve('run-a',token),{kind:'facts',versions:original});
});

test('snapshot tokens cannot resolve across runs or survive begin/end',()=>{
 const snapshots=new ObservedSnapshots();snapshots.begin('run-a');
 const token=snapshots.facts('run-a',snapshotVersions(fixture,policy,1));
 assert.throws(()=>snapshots.resolve('run-b',token),/snapshot_scope_mismatch/);
 assert.throws(()=>snapshots.facts('run-b',snapshotVersions(fixture,policy,1)),/snapshot_scope_mismatch/);
 snapshots.end();assert.throws(()=>snapshots.resolve('run-a',token),/snapshot_scope_mismatch/);
 snapshots.begin('run-b');assert.throws(()=>snapshots.resolve('run-b',token),/unknown_snapshot_token/);
 assert.equal(snapshots.refused('run-b'),'r1');
 assert.deepEqual(snapshots.resolve('run-b','r1'),{kind:'refused'});
 assert.equal(snapshots.facts('run-b',snapshotVersions(fixture,policy,2)),'f1');
 assert.throws(()=>snapshots.resolve('run-a','f1'),/snapshot_scope_mismatch/);
 snapshots.begin('run-c');assert.throws(()=>snapshots.resolve('run-c','r1'),/unknown_snapshot_token/);
});

test('resolved stale snapshots reach the unchanged domain validator without refresh',()=>{
 const snapshots=new ObservedSnapshots();snapshots.begin('run-a');
 const original=snapshotVersions(fixture,policy,1),token=snapshots.facts('run-a',original);
 const observed=snapshots.resolve('run-a',token);if(observed.kind!=='facts')throw new Error('expected_facts');
 const proposal={action_code:'propose_refund' as const,evidence_refs:[reference(policy,policy.clauses.find(clause=>clause.clause_id==='P-DAMAGE')!)],fact_versions:observed.versions,rationale:'Damage within policy.'};
 assert.equal(validateProposal(proposal,fixture,policy,1).valid,true);
 const changed=structuredClone(fixture);changed.order.revision++;
 const stale=validateProposal(proposal,changed,policy,1);
 assert.equal(stale.valid,false);assert.ok(stale.reasons.includes('stale_fact_versions'));
 assert.ok(validateProposal(proposal,fixture,policy,2).reasons.includes('stale_fact_versions'));
 assert.deepEqual(observed.versions,original);
});
