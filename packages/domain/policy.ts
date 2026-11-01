import { z } from 'zod';
import { digest } from './canonical.js';
import { snapshotVersions,verifyReference,type EvidenceRef,type Versions } from './evidence.js';
import type { Action,Fixture,Policy } from '../fixtures/types.js';
export type Decision={action:Action;clause:string;amount_cents:number;capture_id:string|null;reason:string};
const decision=(action:Action,clause:string,reason:string,amount_cents=0,capture_id:string|null=null):Decision=>({action,clause,amount_cents,capture_id,reason});
export function decide(f:Fixture):Decision {
 if(f.trusted_customer_id!==f.order.customer_id)return decision('request_identity_review','P-IDENTITY','identity_mismatch');
 const moneyValid=f.order.currency==='USD'&&f.captures.length>0&&f.captures.every(c=>Number.isSafeInteger(c.amount_cents)&&Number.isSafeInteger(c.refunded_cents)&&c.amount_cents>=0&&c.refunded_cents>=0&&c.refunded_cents<=c.amount_cents)&&new Set(f.captures.map(c=>c.capture_id)).size===f.captures.length;
 if(!moneyValid)return decision('draft_manual_review','P-WINDOW','invalid_money');
 const remaining=f.captures.reduce((sum,c)=>sum+c.amount_cents-c.refunded_cents,0);
 if(!Number.isSafeInteger(remaining)||f.order.captured_cents!==f.captures.reduce((s,c)=>s+c.amount_cents,0)||f.order.refunded_cents!==f.captures.reduce((s,c)=>s+c.refunded_cents,0))return decision('draft_manual_review','P-WINDOW','balance_mismatch');
 if(remaining===0)return f.existing_effect_ref?decision('draft_confirmation','P-REFUNDED','already_refunded'):decision('draft_manual_review','P-WINDOW','missing_effect_reference');
 const available=f.captures.find(c=>c.amount_cents>c.refunded_cents);
 const refund=(clause:string,c=available)=>c?decision('propose_refund',clause,'policy_eligible',c.amount_cents-c.refunded_cents,c.capture_id):decision('draft_manual_review','P-WINDOW','missing_capture');
 if(f.issue==='cancel')return f.order.shipping_state==='paid'?refund('P-CANCEL-BEFORE'):decision('draft_manual_review','P-CANCEL-AFTER','already_shipped');
 if(f.issue==='duplicate') {
  const matches=f.captures.filter(c=>c.duplicate&&Number.isFinite(Date.parse(c.confirmed_at))&&c.amount_cents>c.refunded_cents);
  return f.captures.length===2&&matches.length===1&&f.captures.every(c=>Number.isFinite(Date.parse(c.confirmed_at)))?refund('P-DUPLICATE',matches[0]):decision('draft_manual_review','P-WINDOW','duplicate_not_proven');
 }
 const received=Date.parse(f.received_at);
 if(f.issue==='delay') {
  const elapsed=received-Date.parse(f.order.shipped_at??'');
  return f.order.shipping_state==='shipped'&&Number.isFinite(elapsed)&&elapsed>7*86400000&&f.order.tracking?decision('draft_escalation','P-DELAY','shipment_delayed'):decision('draft_manual_review','P-WINDOW','missing_delay_evidence');
 }
 if(f.issue==='damage'||f.issue==='return') {
  const elapsed=received-Date.parse(f.order.delivered_at??'');
  return f.order.shipping_state==='delivered'&&Number.isFinite(elapsed)&&elapsed>=0&&elapsed<=30*86400000?refund('P-DAMAGE'):decision('draft_manual_review','P-WINDOW','outside_or_unknown_window');
 }
 return decision('draft_manual_review','P-WINDOW','unsupported_situation');
}
export const refSchema=z.object({policy_id:z.string().max(80),version:z.number().int().positive(),clause_id:z.string().max(80),content_digest:z.string().regex(/^[a-f0-9]{64}$/),policy_digest:z.string().regex(/^[a-f0-9]{64}$/),lines:z.tuple([z.number().int().positive(),z.number().int().positive()])}).strict();
export const versionsSchema=z.object({order_id:z.string().max(100),order_revision:z.number().int().positive(),capture_versions:z.record(z.string(),z.number().int().positive()),policy_id:z.string().max(80),policy_version:z.number().int().positive(),policy_revision:z.number().int().positive(),policy_digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const proposalSchema=z.object({action_code:z.enum(['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review']),evidence_refs:z.array(refSchema).max(3),fact_versions:versionsSchema,rationale:z.string().max(500),suggested_amount_cents:z.number().int().nonnegative().max(2147483647).optional()}).strict();
export type ProposalInput=z.infer<typeof proposalSchema>;
export function validateProposal(input:ProposalInput,f:Fixture,p:Policy,headRevision:number) {
 const proposed=proposalSchema.parse(input),expected=decide(f),reasons:string[]=[];
 if(proposed.action_code!==expected.action)reasons.push('action_not_allowed');
 if(!proposed.evidence_refs.some(r=>r.clause_id===expected.clause))reasons.push('missing_required_citation');
 if(proposed.evidence_refs.some(r=>!verifyReference(p,r)))reasons.push('invalid_evidence_version');
 if(digest(proposed.fact_versions)!==digest(snapshotVersions(f,p,headRevision)))reasons.push('stale_fact_versions');
 if(proposed.suggested_amount_cents!==undefined&&proposed.suggested_amount_cents!==expected.amount_cents)reasons.push('amount_mismatch');
 const time=Date.parse(f.received_at);
 if(!Number.isFinite(time)||time<Date.parse(p.effective_from)||(p.effective_until&&time>=Date.parse(p.effective_until)))reasons.push('policy_not_effective');
 if(expected.reason==='invalid_money'||expected.reason==='balance_mismatch')reasons.push(expected.reason);
 return {valid:reasons.length===0,reasons,decision:expected};
}
export function draftText(action:Action):string {
 return ({propose_refund:'A simulated refund is recorded for this synthetic order. No payment provider was contacted.',draft_escalation:'This synthetic shipment requires an escalation draft. No message was sent.',draft_manual_review:'This synthetic request needs manual review. No exception or denial has been issued.',draft_confirmation:'The existing synthetic refund is confirmed. No additional monetary effect was created.',request_identity_review:'Manual identity review is required. No order facts were disclosed.'})[action];
}
