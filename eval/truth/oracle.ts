import type { Fixture, Action } from '../../packages/fixtures/types.js';
export type Truth={fixture_id:string;action:Action;clause:string;amount_cents:number;capture_id:string|null;effect_count:number;terminal:string};
// Independent specification implementation. This module never imports domain decision code.
export function oracle(f:Fixture):Truth {
  const out=(action:Action,clause:string,amount=0,capture:string|null=null):Truth=>({fixture_id:f.fixture_id,action,clause,amount_cents:amount,capture_id:capture,effect_count:amount>0?1:0,terminal:action==='request_identity_review'?'blocked':'completed'});
  if(f.trusted_customer_id!==f.order.customer_id)return out('request_identity_review','P-IDENTITY');
  const total=f.captures.reduce((s,c)=>s+c.amount_cents-c.refunded_cents,0);
  if(total===0)return out('draft_confirmation','P-REFUNDED');
  if(f.issue==='cancel'&&f.order.shipping_state!=='paid')return out('draft_manual_review','P-CANCEL-AFTER');
  if(f.issue==='delay')return out(f.order.tracking&&f.order.shipped_at&&Date.parse(f.received_at)-Date.parse(f.order.shipped_at)>604800000?'draft_escalation':'draft_manual_review',f.order.tracking?'P-DELAY':'P-WINDOW');
  if(f.issue==='duplicate') {
    const second=f.captures.find(c=>c.duplicate&&c.confirmed_at);
    return second&&new Set(f.captures.map(c=>c.capture_id)).size>=2?out('propose_refund','P-DUPLICATE',second.amount_cents-second.refunded_cents,second.capture_id):out('draft_manual_review','P-WINDOW');
  }
  if(f.issue==='damage'||f.issue==='return') {
    const t=f.order.delivered_at?Date.parse(f.received_at)-Date.parse(f.order.delivered_at):NaN;
    if(!Number.isFinite(t)||t<0||t>2592000000)return out('draft_manual_review','P-WINDOW');
  }
  const first=f.captures.find(c=>c.amount_cents>c.refunded_cents)!;
  if(f.issue==='damage'||f.issue==='return'||(f.issue==='cancel'&&f.order.shipping_state==='paid'))return out('propose_refund',f.issue==='cancel'?'P-CANCEL-BEFORE':'P-DAMAGE',first.amount_cents-first.refunded_cents,first.capture_id);
  return out('draft_manual_review','P-WINDOW');
}
