import type pg from 'pg';
import type { Truth } from '../truth/oracle.js';
export const ledgerQuery=`SELECT c.capture_id,c.order_id, c.amount_cents, c.refunded_cents, c.initial_refunded_cents,
 COALESCE(SUM(e.amount_cents),0)::int AS effects_cents,
 COUNT(e.effect_id)::int AS effect_count
 FROM handoff.captures c LEFT JOIN handoff.effects e
 ON e.session_id=c.session_id AND e.capture_id=c.capture_id
 WHERE c.session_id=$1 GROUP BY c.session_id,c.capture_id ORDER BY c.capture_id`;
export function gradeLedger(rows:any[],effects:any[],events:any[],state:string,truth:Truth,business?:{orders:any[];dispositions:any[]}){
 if(!rows.length)throw new Error('empty_audit_evidence');
 const errors:string[]=[];
 for(const c of rows){if(c.amount_cents<c.refunded_cents||c.refunded_cents<0||c.effects_cents!==c.refunded_cents-c.initial_refunded_cents)errors.push('money_conservation');}
 if(effects.length!==truth.effect_count)errors.push('effect_count');
 for(const effect of effects){
  if(effect.amount_cents!==truth.amount_cents||effect.currency!=='USD'||effect.capture_id!==truth.capture_id)errors.push('effect_policy');
  if(effect.decision!=='approve'||effect.review_digest!==effect.proposal_digest||!effect.validation_result)errors.push('effect_authority');
  const time=(value:unknown)=>value instanceof Date?value.getTime():Date.parse(String(value));
  const authorized=time(effect.authorized_at),expires=time(effect.expires_at);
  if(!Number.isFinite(authorized)||!Number.isFinite(expires)||authorized>=expires)errors.push('expired_authority');
  if(events.filter(x=>x.event_type==='effect_committed'&&x.safe_payload.result_id===effect.effect_id).length!==1)errors.push('event_atomicity');
 }
 if(state!==truth.terminal)errors.push('terminal_state');
 if(new Set(events.map(e=>e.sequence)).size!==events.length)errors.push('duplicate_event');
 if(events.filter(e=>e.event_type==='effect_committed').length!==(truth.terminal==='completed'?1:0))errors.push('unexpected_commit_event');
 if(business){
  if(!business.orders.length)errors.push('missing_order_ledger');
  for(const order of business.orders){const captures=rows.filter(c=>c.order_id===order.order_id);if(!captures.length||captures.reduce((s,c)=>s+c.amount_cents,0)!==order.captured_cents||captures.reduce((s,c)=>s+c.refunded_cents,0)!==order.refunded_cents)errors.push('order_conservation');}
  if(business.dispositions.length!==(truth.terminal==='completed'&&truth.effect_count===0?1:0))errors.push('draft_count');
  for(const draft of business.dispositions){
   const time=(v:any)=>v instanceof Date?v.getTime():Date.parse(String(v)),a=time(draft.authorized_at),e=time(draft.expires_at);
   if(draft.decision!=='approve'||draft.review_digest!==draft.proposal_digest||!draft.validation_result||!Number.isFinite(a)||!Number.isFinite(e)||a>=e)errors.push('draft_authority');
   if(draft.result.amount_cents!==0||draft.result.currency!=='USD'||draft.result.kind!=='draft_only'||draft.result.simulated!==true)errors.push('draft_policy');
   if(events.filter(e=>e.event_type==='effect_committed'&&e.safe_payload.result_id===draft.disposition_id).length!==1)errors.push('draft_event_atomicity');
  }
 }
 return {passed:errors.length===0,errors:[...new Set(errors)],effect_count:effects.length,refunded_cents:effects.reduce((s,e)=>s+e.amount_cents,0)};
}
export async function audit(pool:pg.Pool,sid:string,id:string,truth:Truth){
 const rows=(await pool.query(ledgerQuery,[sid])).rows;
 const effects=(await pool.query(`SELECT e.effect_id,e.capture_id,e.amount_cents,e.currency,e.authorized_at,
 r.decision,r.expires_at,r.proposal_digest AS review_digest,p.content_digest AS proposal_digest,p.validation_result
 FROM handoff.effects e LEFT JOIN handoff.reviews r ON r.session_id=e.session_id AND r.review_id=e.review_id
 LEFT JOIN handoff.proposals p ON p.session_id=e.session_id AND p.proposal_id=e.proposal_id WHERE e.session_id=$1 AND e.case_id=$2`,[sid,id])).rows;
 const events=(await pool.query('SELECT sequence,event_type,safe_payload FROM handoff.case_events WHERE session_id=$1 AND case_id=$2 ORDER BY sequence',[sid,id])).rows;
 const c=(await pool.query('SELECT state FROM handoff.cases WHERE session_id=$1 AND case_id=$2',[sid,id])).rows[0];
 const orders=(await pool.query('SELECT order_id,captured_cents,refunded_cents FROM handoff.orders WHERE session_id=$1 ORDER BY order_id',[sid])).rows;
 const dispositions=(await pool.query(`SELECT d.disposition_id,d.result,d.authorized_at,r.decision,r.expires_at,r.proposal_digest AS review_digest,p.content_digest AS proposal_digest,p.validation_result FROM handoff.dispositions d LEFT JOIN handoff.reviews r ON r.session_id=d.session_id AND r.review_id=d.review_id LEFT JOIN handoff.proposals p ON p.session_id=d.session_id AND p.proposal_id=d.proposal_id WHERE d.session_id=$1 AND d.case_id=$2`,[sid,id])).rows;
 return {...gradeLedger(rows,effects,events,c.state,truth,{orders,dispositions}),ledger:rows,effects,events,orders,dispositions,state:c.state};
}
