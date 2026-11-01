import { Workflow } from './workflow.js';
import { uid } from './store.js';
import { requireThat } from './errors.js';
import { digest } from './canonical.js';
import { validateProposal,draftText } from './policy.js';
export class Handoff extends Workflow {
 async execute(cap:string,id:string,input:{proposal_digest:string;expected_revision:number},key:string){
  let fresh=false;
  const result=await this.mutation(cap,`execute:${id}`,key,input,async(db,s)=>{
   fresh=false;
   const c=await this.case(db,s.session_id,id,true);
   const p=(await db.query('SELECT * FROM handoff.proposals WHERE session_id=$1 AND case_id=$2 AND content_digest=$3 FOR UPDATE',[s.session_id,id,input.proposal_digest])).rows[0];requireThat(p,'invalid_proposal',409);
   // Recovery precedes revision, approval expiry and post-effect balance checks.
   const previous=(await db.query('SELECT result FROM handoff.effects WHERE session_id=$1 AND proposal_id=$2 UNION ALL SELECT result FROM handoff.dispositions WHERE session_id=$1 AND proposal_id=$2',[s.session_id,p.proposal_id])).rows[0];
   if(previous)return previous.result;
   requireThat(c.revision===input.expected_revision,'revision_conflict',409);requireThat(c.state==='approved'&&p.validation_result,'approval_required',409);
   const r=(await db.query('SELECT * FROM handoff.reviews WHERE session_id=$1 AND proposal_id=$2 ORDER BY decided_at DESC LIMIT 1 FOR UPDATE',[s.session_id,p.proposal_id])).rows[0];
   requireThat(r&&r.decision==='approve'&&r.proposal_digest===p.content_digest,'approval_required',409);
   const w=await this.world(db,c,true);
   const clock=(await db.query('SELECT clock_timestamp() AS authorized_at, $1::timestamptz>clock_timestamp() AS unexpired',[r.expires_at])).rows[0];
   if(!clock.unexpired){await this.transition(db,c,'expired','execution_expired',{review_id:r.review_id});return {code:'review_expired',state:c.state,revision:c.revision};}
   const v=validateProposal(p.envelope.input,w.fixture,w.policy,w.policyRevision);
   if(!v.valid||digest(r.fact_versions)!==digest(p.fact_versions)){
    await this.transition(db,c,'review_needed','stale_execution_refused',{review_id:r.review_id,reasons:v.reasons});return {code:'stale_approval',state:c.state,revision:c.revision};
   }
   requireThat(v.decision.amount_cents===p.amount_cents&&v.decision.capture_id===p.capture_id,'proposal_corrupt',409);
   const kind=p.action_code==='propose_refund'?'simulated_refund':'draft_only';
   const operationKey=digest({session:s.session_id,case:id,proposal:p.content_digest,target:p.capture_id??p.action_code,kind});
   const resultId=uid(kind==='simulated_refund'?'effect':'draft');
   const receipt={case_id:id,result_id:resultId,operation_key:operationKey,proposal_digest:p.content_digest,review_id:r.review_id,kind,amount_cents:p.amount_cents,currency:p.currency,capture_id:p.capture_id,state:'completed',draft:draftText(p.action_code),authorized_at:clock.authorized_at.toISOString(),simulated:true};
   if(kind==='simulated_refund') {
    requireThat(p.amount_cents>0,'invalid_effect_amount');
    await db.query('INSERT INTO handoff.effects(session_id,effect_id,case_id,proposal_id,review_id,operation_key,capture_id,amount_cents,currency,authorized_at,result_digest,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[s.session_id,resultId,id,p.proposal_id,r.review_id,operationKey,p.capture_id,p.amount_cents,p.currency,clock.authorized_at,digest(receipt),JSON.stringify(receipt)]);
    const changed=await db.query('UPDATE handoff.captures SET refunded_cents=refunded_cents+$3,revision=revision+1 WHERE session_id=$1 AND capture_id=$2 AND amount_cents-refunded_cents >= $3',[s.session_id,p.capture_id,p.amount_cents]);requireThat(changed.rowCount===1,'insufficient_balance',409);
    await db.query('UPDATE handoff.orders SET refunded_cents=refunded_cents+$3,revision=revision+1 WHERE session_id=$1 AND order_id=$2',[s.session_id,w.fixture.order.order_id,p.amount_cents]);
   } else {
    requireThat(p.amount_cents===0,'draft_cannot_move_money');
    await db.query('INSERT INTO handoff.dispositions(session_id,disposition_id,case_id,proposal_id,review_id,operation_key,result,authorized_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[s.session_id,resultId,id,p.proposal_id,r.review_id,operationKey,JSON.stringify(receipt),clock.authorized_at]);
   }
   await this.transition(db,c,'completed','effect_committed',{kind,result_id:resultId,operation_key:operationKey,amount_cents:p.amount_cents,currency:p.currency},'executor');
   if(this.options.beforeCommit)await this.options.beforeCommit(db);
   fresh=true;return receipt;
  });
  if(fresh&&this.options.afterCommit)await this.options.afterCommit();
  return result;
 }
}
