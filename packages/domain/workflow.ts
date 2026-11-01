import { Store,uid,type CaseRow } from './store.js';
import type { Db } from '../db/client.js';
import { transaction } from '../db/client.js';
import { digest } from './canonical.js';
import { requireThat } from './errors.js';
import { decide,proposalSchema,validateProposal,type ProposalInput } from './policy.js';
import { findClauses,reference,scopedFacts,snapshotVersions } from './evidence.js';
import { boundedRead } from './retry.js';

export class Workflow extends Store {
 async getOrderFacts(cap:string,id:string,orderId:string){
  if(this.options.readFault)await this.options.readFault();
  return transaction(this.pool,async db=>{const s=await this.scope(db,cap),c=await this.case(db,s.session_id,id),w=await this.world(db,c);return {...scopedFacts(w.fixture,orderId),fact_versions:snapshotVersions(w.fixture,w.policy,w.policyRevision)};});
 }
 async getPolicies(cap:string,id:string,query:string){return transaction(this.pool,async db=>{const s=await this.scope(db,cap),c=await this.case(db,s.session_id,id),w=await this.world(db,c);return findClauses(w.policy,query,w.fixture.received_at);});}
 async putProposal(db:Db,c:CaseRow,input:ProposalInput){
  const w=await this.world(db,c,true),validation=validateProposal(input,w.fixture,w.policy,w.policyRevision);
  const envelope={case_id:c.case_id,input,derived:{amount_cents:validation.decision.amount_cents,currency:'USD',capture_id:validation.decision.capture_id},controller_mode:c.controller_mode,configuration_digest:c.config_digest,field_sources:{action_code:'controller',amount_cents:'policy_validator',currency:'order',evidence_refs:'versioned_policy',fact_versions:'scoped_snapshot',rationale:'untrusted_controller_text'}};
  const proposalDigest=digest(envelope),id=uid('proposal');
  await db.query('INSERT INTO handoff.proposals(session_id,proposal_id,case_id,action_code,amount_cents,currency,capture_id,evidence_refs,fact_versions,content_digest,envelope,controller_mode,validation_result,validation_reason_codes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[c.session_id,id,c.case_id,input.action_code,validation.decision.amount_cents,'USD',validation.decision.capture_id,JSON.stringify(input.evidence_refs),JSON.stringify(input.fact_versions),proposalDigest,JSON.stringify(envelope),c.controller_mode,validation.valid,JSON.stringify(validation.reasons)]);
  await this.event(db,c,'proposed',{proposal_id:id,proposal_digest:proposalDigest,valid:validation.valid,reasons:validation.reasons},c.controller_mode);
  const state=validation.valid?(validation.decision.action==='request_identity_review'?'blocked':'awaiting_review'):'review_needed';
  await this.transition(db,c,state,validation.valid?'validation_passed':'validation_refused',{proposal_id:id,reasons:validation.reasons});
  return {case_id:c.case_id,proposal_id:id,proposal_digest:proposalDigest,state,revision:c.revision,valid:validation.valid,reasons:validation.reasons};
 }
 async propose(cap:string,id:string,input:ProposalInput,expectedRevision:number,key:string){
  proposalSchema.parse(input);
  return this.mutation(cap,`propose:${id}`,key,{input,expectedRevision},async(db,s)=>{
   const c=await this.case(db,s.session_id,id,true);requireThat(c.revision===expectedRevision,'revision_conflict',409);requireThat(c.state==='gathering','invalid_transition',409);return this.putProposal(db,c,input);
  });
 }
 async step(cap:string,id:string,expectedRevision:number,key:string,revise=false){
  const retries:{attempt:number;delay_ms:number;reason:string}[]=[];
  let readExhausted=false;
  if(this.options.readFault){try{await boundedRead(this.options.readFault,async(attempt,delay)=>{retries.push({attempt,delay_ms:delay,reason:'read_timeout'});});}catch(error){if((error as Error).message!=='read_timeout')throw error;readExhausted=true;}}
  return this.mutation(cap,`step:${id}`,key,{expectedRevision,revise},async(db,s)=>{
   const c=await this.case(db,s.session_id,id,true);requireThat(c.revision===expectedRevision,'revision_conflict',409);
   if(['review_needed','rejected','expired'].includes(c.state)){
    requireThat(revise,'explicit_revision_required',409);await this.transition(db,c,'gathering','revision_requested',{});return {case_id:id,state:c.state,revision:c.revision};
   }
   if(c.state==='received'){await this.transition(db,c,'gathering','gathering_started',{});return {case_id:id,state:c.state,revision:c.revision};}
   if(c.state!=='gathering')return {case_id:id,state:c.state,revision:c.revision,noop:true,reason:'no_automatic_next_action'};
   requireThat(c.controller_mode==='scripted','model_step_requires_private_harness',409);
   for(const retry of retries)await this.event(db,c,'read_retry',retry,'scripted');
   if(readExhausted){await this.transition(db,c,'review_needed','read_retry_exhausted',{attempts:3});return {case_id:id,state:c.state,revision:c.revision,reason:'read_retry_exhausted'};}
   const w=await this.world(db,c,true),d=decide(w.fixture),clause=w.policy.clauses.find(x=>x.clause_id===d.clause);requireThat(clause,'missing_evidence',409);
   if(d.action!=='request_identity_review')scopedFacts(w.fixture,w.fixture.order.order_id);
   await this.event(db,c,'evidence_gathered',{clause_id:clause.clause_id,policy_version:w.policy.version,scope:d.action==='request_identity_review'?'refused':'matched'},'scripted');
   return this.putProposal(db,c,{action_code:d.action,evidence_refs:[reference(w.policy,clause)],fact_versions:snapshotVersions(w.fixture,w.policy,w.policyRevision),rationale:'Deterministic synthetic policy decision.'});
  });
 }
 async review(cap:string,id:string,input:{proposal_digest:string;expected_revision:number;decision:'approve'|'reject'},key:string,reviewer:'demo_user'|'scripted_test'|'recorded_human'='demo_user'){
  requireThat(reviewer==='demo_user'||this.options.testMode,'invalid_reviewer');
  return this.mutation(cap,`review:${id}`,key,input,async(db,s)=>{
   const c=await this.case(db,s.session_id,id,true);requireThat(c.revision===input.expected_revision,'revision_conflict',409);requireThat(c.state==='awaiting_review','invalid_transition',409);
   const p=(await db.query('SELECT * FROM handoff.proposals WHERE session_id=$1 AND case_id=$2 AND content_digest=$3 FOR UPDATE',[s.session_id,id,input.proposal_digest])).rows[0];requireThat(p&&p.validation_result,'invalid_proposal',409);
   const w=await this.world(db,c,true),v=validateProposal(p.envelope.input,w.fixture,w.policy,w.policyRevision);
   if(!v.valid){await this.transition(db,c,'review_needed','stale_review_refused',{reasons:v.reasons});return {code:'stale_proposal',state:c.state,revision:c.revision};}
   const reviewId=uid('review');
   const r=(await db.query("INSERT INTO handoff.reviews(session_id,review_id,proposal_id,proposal_digest,decision,reviewer_kind,fact_versions,expires_at,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '15 minutes',$8) RETURNING expires_at",[s.session_id,reviewId,p.proposal_id,p.content_digest,input.decision,reviewer,JSON.stringify(p.fact_versions),key])).rows[0];
   await this.transition(db,c,input.decision==='approve'?'approved':'rejected','review_decided',{review_id:reviewId,decision:input.decision,proposal_digest:p.content_digest,expires_at:r.expires_at.toISOString()},reviewer);
   return {case_id:id,review_id:reviewId,proposal_digest:p.content_digest,expires_at:r.expires_at,state:c.state,revision:c.revision};
  });
 }
}
