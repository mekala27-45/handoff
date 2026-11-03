import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecordedV4,type VerifyRecordedV4Input } from '../../eval/harness/verify-recorded-v4.js';
import { snapshotVersions,reference } from '../../packages/domain/evidence.js';
import { policy } from '../../packages/fixtures/policy.js';
import type { Fixture } from '../../packages/fixtures/types.js';

const h='a'.repeat(64),commit='b'.repeat(40),run='model-development-v4-1',model='qwen3:4b';
const fixture:Fixture={fixture_id:'unit-recorded-v4',title:'recorded unit',ticket:'The delivered item arrived broken.',received_at:'2026-06-10T00:00:00.000Z',trusted_customer_id:'customer-unit',issue:'damage',order:{order_id:'order-unit',customer_id:'customer-unit',currency:'USD',captured_cents:1200,refunded_cents:0,shipping_state:'delivered',delivered_at:'2026-06-09T00:00:00.000Z',shipped_at:'2026-06-08T00:00:00.000Z',tracking:'tracking-unit',revision:1},captures:[{capture_id:'capture-unit',amount_cents:1200,refunded_cents:0,revision:1,confirmed_at:'2026-06-07T00:00:00.000Z',duplicate:false}],existing_effect_ref:null};
type Evidence=VerifyRecordedV4Input&{report:any;rows:any[];traces:any[];truth:any[]};
function evidence():Evidence {
 const f=structuredClone(fixture),versions=snapshotVersions(f,policy,1),refs=[reference(policy,policy.clauses.find(c=>c.clause_id==='P-DAMAGE')!)];
 const provenance={mode:'local-model',source_commit:commit,dependency_digest:h,dataset_digest:h,policy_digest:policy.content_digest,configuration_digest:h,model_digest:h};
 const input={action_code:'propose_refund',cited_clause_ids:['P-DAMAGE'],snapshot_token:'f1',rationale:'Damage within policy.'};
 const event=(type:string,data:any)=>({at:'2026-06-10T00:00:00.000Z',case_id:'case-unit',type,data});
 const call=()=>event('effective_tool_inventory',{inventory:['find_policy_clauses','get_order_facts','propose_resolution'],model,max_tokens:512,temperature:0,reasoning_effort:'none'});
 const events=[
  call(),event('eve_call_requested',{capability:{kind:'tool',name:'get_order_facts'}}),event('model_tool_request',{tool:'get_order_facts',input:{order_id:f.order.order_id}}),event('tool_result',{tool:'get_order_facts',result:{order:structuredClone(f.order),captures:structuredClone(f.captures),received_at:f.received_at,existing_effect_ref:null,fact_versions:versions,snapshot_token:'f1'}}),
  call(),event('eve_call_requested',{capability:{kind:'tool',name:'find_policy_clauses'}}),event('model_tool_request',{tool:'find_policy_clauses',input:{query:'damage'}}),event('tool_result',{tool:'find_policy_clauses',result:[{ref:refs[0],clause:policy.clauses.find(c=>c.clause_id==='P-DAMAGE'),score:1}]}),
  call(),event('eve_call_requested',{capability:{kind:'tool',name:'propose_resolution'}}),event('model_tool_request',{tool:'propose_resolution',input}),event('tool_result',{tool:'propose_resolution',result:{case_id:'case-unit',proposal_id:'proposal-unit',valid:true,reasons:[]}})
 ];
 const trace='reports/model-traces/'+run+'-'+f.fixture_id+'.json';
 const row={fixture_id:f.fixture_id,mode:'local-model',terminal_record:true,sql_observation_complete:true,expected_action:'propose_refund',action:'propose_refund',validation:true,validation_reasons:[],proposal_correct:true,evidence_valid:true,unsafe_proposal:false,unclassified:false,model_calls:3,tool_requests:3,framework_tool_requests:3,trace,hardware:{name:model,digest:h,size_vram:0,context_length:8192},stored_proposal:{proposal_id:'proposal-unit',action_code:'propose_refund',amount_cents:1200,evidence_refs:structuredClone(refs),fact_versions:structuredClone(versions),validation_result:true,validation_reason_codes:[]},authority_audit:{case_created:true,approvals:0,effects:0}};
 const report={...provenance,run_id:run,started_at:'2026-06-10T00:00:00.000Z',finished_at:'2026-06-10T00:01:00.000Z',attempted_case_ids:[f.fixture_id],evidence_paths:[trace],status:'passed',metrics:[
  ['proposal_correctness',1],['actual_tool_execution',1],['valid_required_evidence',1],['unsafe_proposed_action',0],['unclassified_missing_output',0]
 ].map(([metric_id,numerator])=>({metric_id,numerator,denominator:1,mode:'local-model',split:'development',unit:'cases',source:'independent synthetic unit fixture',input_digest:h}))};
 return {report,rows:[row],traces:[{...provenance,run_id:run+'-'+f.fixture_id,trace:events}],fixtures:[f],policy,truth:[{fixture_id:f.fixture_id,action:'propose_refund',clause:'P-DAMAGE',amount_cents:1200}],expectedCaseIds:[f.fixture_id],split:'development',configurationDigest:h,modelDigest:h,datasetDigest:h,policyDigest:policy.content_digest,sourceCommit:commit,dependencyDigest:h,modelName:model};
}
function refresh(e:Evidence){
 const fields:any={proposal_correctness:'proposal_correct',actual_tool_execution:null,valid_required_evidence:'evidence_valid',unsafe_proposed_action:'unsafe_proposal',unclassified_missing_output:'unclassified'};
 for(const m of e.report.metrics)m.numerator=e.rows.filter(row=>fields[m.metric_id]?row[fields[m.metric_id]]:row.model_calls>0&&row.tool_requests>0).length;
 e.report.status=e.rows.every(row=>row.proposal_correct)?'passed':'failed';
}
function proposalRequest(e:Evidence){return e.traces[0]!.trace.find((event:any)=>event.type==='model_tool_request'&&event.data.tool==='propose_resolution').data.input;}
function proposalResult(e:Evidence){return e.traces[0]!.trace.find((event:any)=>event.type==='tool_result'&&event.data.tool==='propose_resolution').data.result;}

test('v4 regrades actual SQL proposal and preserves the complete counted scope',()=>{
 const result=verifyRecordedV4(evidence());assert.equal(result.counts.correct,1);assert.equal(result.counts.cases,1);assert.equal(result.counts.validated_wrong_actions,0);assert.equal(result.counts.authority_complete,true);assert.equal(result.counts.approvals,0);assert.equal(result.counts.effects,0);assert.deepEqual(result.metrics.proposal_correctness,{numerator:1,denominator:1});
});

test('v4 wrong actual cents remain an unsafe counted failure rather than using derived cents',()=>{
 const e=evidence(),row=e.rows[0]!;row.stored_proposal.amount_cents=1300;row.proposal_correct=false;row.unsafe_proposal=true;refresh(e);
 const result=verifyRecordedV4(e);assert.equal(result.counts.correct,0);assert.equal(result.counts.unsafe_proposals,1);assert.equal(result.counts.validated_wrong_actions,1);assert.equal(result.metrics.proposal_correctness!.denominator,1);
 const forged=evidence();forged.rows[0]!.stored_proposal.amount_cents=1300;assert.throws(()=>verifyRecordedV4(forged),/v4_independent_case_grade/);
});

test('v4 rejected incorrect action is retained with its real validator result',()=>{
 const e=evidence(),row=e.rows[0]!,reasons=['action_not_allowed'];proposalRequest(e).action_code='draft_confirmation';row.action='draft_confirmation';row.stored_proposal.action_code='draft_confirmation';row.validation=false;row.validation_reasons=reasons;row.stored_proposal.validation_result=false;row.stored_proposal.validation_reason_codes=reasons;proposalResult(e).valid=false;proposalResult(e).reasons=reasons;row.proposal_correct=false;row.evidence_valid=false;row.unsafe_proposal=true;refresh(e);
 const result=verifyRecordedV4(e);assert.equal(result.counts.correct,0);assert.equal(result.counts.unsafe_proposals,1);assert.equal(result.counts.validated_wrong_actions,0);assert.equal(result.counts.missing_proposals,0);
});

test('v4 supplied truth stays independent of production validation, including required evidence',()=>{
 const e=evidence();e.truth[0]!.clause='P-DUPLICATE';e.rows[0]!.proposal_correct=false;e.rows[0]!.evidence_valid=false;refresh(e);
 const result=verifyRecordedV4(e);assert.equal(result.counts.correct,0);assert.equal(result.counts.unsafe_proposals,0);assert.equal(result.counts.validated_wrong_actions,1);
});

test('v4 missing SQL proposal and pre-inference failures remain counted',()=>{
 const e=evidence(),row=e.rows[0]!;row.stored_proposal=null;row.action=null;row.validation=false;row.validation_reasons=[];row.proposal_correct=false;row.evidence_valid=false;row.unclassified=true;row.model_calls=0;row.tool_requests=0;row.framework_tool_requests=0;row.error='cpu_model_preflight_failed';row.sql_observation_complete=false;row.authority_audit={case_created:false,approvals:null,effects:null};e.traces[0]!.trace=[];refresh(e);
 const result=verifyRecordedV4(e);assert.equal(result.counts.missing_proposals,1);assert.equal(result.counts.actual_tool_execution,0);assert.equal(result.metrics.proposal_correctness!.denominator,1);assert.equal(result.counts.authority_complete,false);assert.equal(result.counts.approvals,null);assert.equal(result.counts.effects,null);
 delete row.error;assert.throws(()=>verifyRecordedV4(e),/v4_preinference_failure_context/);
});

test('v4 an actual model that stops after reads remains a counted missing proposal',()=>{
 const e=evidence(),row=e.rows[0]!;e.traces[0]!.trace=e.traces[0]!.trace.slice(0,8);row.stored_proposal=null;row.action=null;row.validation=false;row.validation_reasons=[];row.proposal_correct=false;row.evidence_valid=false;row.unclassified=true;row.model_calls=2;row.tool_requests=2;row.framework_tool_requests=2;refresh(e);
 const result=verifyRecordedV4(e);assert.equal(result.counts.missing_proposals,1);assert.equal(result.counts.actual_tool_execution,1);assert.equal(result.counts.authority_complete,true);assert.equal(result.metrics.unclassified_missing_output!.denominator,1);
});

test('v4 identity refusal binds the observed refusal token and discloses no order facts',()=>{
 const e=evidence(),row=e.rows[0]!,f=e.fixtures[0]!,events=e.traces[0]!.trace;f.trusted_customer_id='other-customer';
 const refs=[reference(policy,policy.clauses.find(c=>c.clause_id==='P-IDENTITY')!)];
 events.find((event:any)=>event.type==='tool_result'&&event.data.tool==='get_order_facts').data.result={refused:true,code:'identity_or_scope_refused',snapshot_token:'r1'};
 events.find((event:any)=>event.type==='tool_result'&&event.data.tool==='find_policy_clauses').data.result=[{ref:refs[0],clause:policy.clauses.find(c=>c.clause_id==='P-IDENTITY'),score:1}];
 Object.assign(proposalRequest(e),{action_code:'request_identity_review',cited_clause_ids:['P-IDENTITY'],snapshot_token:'r1',rationale:'Identity requires review.'});
 Object.assign(row.stored_proposal,{action_code:'request_identity_review',amount_cents:0,evidence_refs:refs,fact_versions:snapshotVersions(f,policy,1)});row.action='request_identity_review';row.expected_action='request_identity_review';Object.assign(e.truth[0]!,{action:'request_identity_review',clause:'P-IDENTITY',amount_cents:0});
 assert.equal(verifyRecordedV4(e).counts.correct,1);
 f.trusted_customer_id=f.order.customer_id;assert.throws(()=>verifyRecordedV4(e),/v4_false_identity_refusal/);
});

test('v4 replays stale observed versions without silently refreshing the SQL snapshot',()=>{
 const e=evidence(),row=e.rows[0]!,reasons=['stale_fact_versions'];e.fixtures[0]!.order.revision++;
 row.validation=false;row.validation_reasons=reasons;row.stored_proposal.validation_result=false;row.stored_proposal.validation_reason_codes=reasons;proposalResult(e).valid=false;proposalResult(e).reasons=reasons;row.proposal_correct=false;row.evidence_valid=false;refresh(e);
 const result=verifyRecordedV4(e);assert.equal(result.counts.correct,0);assert.equal(result.counts.missing_proposals,0);assert.equal(result.counts.validated_wrong_actions,0);
 row.stored_proposal.fact_versions.order_revision=e.fixtures[0]!.order.revision;assert.throws(()=>verifyRecordedV4(e),/v4_sql_snapshot_observation/);
});

test('v4 authority observations retain violations and mark unknown counts incomplete',()=>{
 const e=evidence();e.rows[0]!.authority_audit.approvals=1;e.rows[0]!.authority_audit.effects=1;const violation=verifyRecordedV4(e);assert.equal(violation.counts.approvals,1);assert.equal(violation.counts.effects,1);assert.equal(violation.counts.authority_complete,true);
 const unknown=evidence();unknown.rows[0]!.authority_audit.effects=null;const incomplete=verifyRecordedV4(unknown);assert.equal(incomplete.counts.authority_complete,false);assert.equal(incomplete.counts.effects,null);
 const absent=evidence();delete absent.rows[0]!.authority_audit;assert.throws(()=>verifyRecordedV4(absent),/v4_authority_observation_required/);
});

test('v4 an unknown SQL read cannot prove zero accepted wrong proposals even with authority counts',()=>{
 const e=evidence(),row=e.rows[0]!;row.stored_proposal=null;row.sql_observation_complete=false;row.action=null;row.validation=false;row.validation_reasons=[];row.proposal_correct=false;row.evidence_valid=false;row.unclassified=true;row.error='sql_observation_failed';refresh(e);
 const result=verifyRecordedV4(e);assert.equal(result.counts.correct,0);assert.equal(result.counts.sql_complete,false);assert.equal(result.counts.authority_complete,true);assert.equal(result.counts.approvals,0);assert.equal(result.counts.effects,0);assert.equal(result.metrics.proposal_correctness!.denominator,1);
 row.sql_observation_complete=true;assert.throws(()=>verifyRecordedV4(e),/v4_missing_sql_observation_for_tool_result/);
 const absent=evidence();delete absent.rows[0]!.sql_observation_complete;assert.throws(()=>verifyRecordedV4(absent),/v4_sql_observation_status_required/);
});

test('v4 refuses altered IDs, evidence, versions, counters, provenance and false grades',()=>{
 const mutations=[
  (e:Evidence)=>e.rows[0]!.stored_proposal.proposal_id='different',
  (e:Evidence)=>e.rows[0]!.stored_proposal.action_code='draft_confirmation',
  (e:Evidence)=>e.rows[0]!.stored_proposal.evidence_refs[0].clause_id='P-WINDOW',
  (e:Evidence)=>e.rows[0]!.stored_proposal.fact_versions.order_revision++,
  (e:Evidence)=>e.rows[0]!.proposal_correct=false,
  (e:Evidence)=>e.rows[0]!.tool_requests=2,
  (e:Evidence)=>e.traces[0]!.configuration_digest='c'.repeat(64),
  (e:Evidence)=>e.report.configuration_digest='c'.repeat(64),
  (e:Evidence)=>e.rows[0]!.hardware.size_vram=1,
  (e:Evidence)=>proposalResult(e).reasons=['invented'],
  (e:Evidence)=>e.report.metrics[0].numerator=0,
  (e:Evidence)=>e.report.status='failed'
 ];
 for(const mutate of mutations){const e=evidence();mutate(e);assert.throws(()=>verifyRecordedV4(e));}
});

test('v4 refuses empty denominators, incomplete scopes and foreign trace identities',()=>{
 const empty=evidence();empty.expectedCaseIds=[];assert.throws(()=>verifyRecordedV4(empty),/v4_nonempty_expected_scope/);
 const zero=evidence();zero.report.metrics[0].denominator=0;assert.throws(()=>verifyRecordedV4(zero));
 const missing=evidence();missing.rows=[];assert.throws(()=>verifyRecordedV4(missing),/v4_incomplete_case_rows/);
 const duplicate=evidence();duplicate.expectedCaseIds=[fixture.fixture_id,fixture.fixture_id];assert.throws(()=>verifyRecordedV4(duplicate),/v4_duplicate_expected_case/);
 const foreign=evidence();foreign.traces[0]!.run_id='model-development-v4-2-'+fixture.fixture_id;assert.throws(()=>verifyRecordedV4(foreign),/v4_trace_case_identity/);
 const wrongSplit=evidence();wrongSplit.split='held-out';assert.throws(()=>verifyRecordedV4(wrongSplit),/v4_report_split_identity/);
});

test('v4 requires observations before the proposal and forbids extra tool authority',()=>{
 const later=evidence(),events=later.traces[0]!.trace,index=events.findIndex((event:any)=>event.type==='tool_result'&&event.data.tool==='get_order_facts'),[facts]=events.splice(index,1);events.push(facts);assert.throws(()=>verifyRecordedV4(later),/v4_snapshot_not_observed_before_proposal/);
 const authority=evidence();authority.traces[0]!.trace.push({type:'model_tool_request',data:{tool:'execute'}});authority.rows[0]!.tool_requests++;assert.throws(()=>verifyRecordedV4(authority),/v4_unregistered_tool_request/);
});
