export type Action = 'propose_refund'|'draft_escalation'|'draft_manual_review'|'draft_confirmation'|'request_identity_review';
export type Issue = 'damage'|'delay'|'cancel'|'duplicate'|'return'|'status';
export type Capture = {capture_id:string; amount_cents:number; refunded_cents:number; revision:number; confirmed_at:string; duplicate:boolean};
export type Fixture = {
  fixture_id:string; title:string; ticket:string; received_at:string; trusted_customer_id:string; issue:Issue;
  order:{order_id:string;customer_id:string;currency:string;captured_cents:number;refunded_cents:number;shipping_state:'paid'|'shipped'|'delivered';delivered_at:string|null;shipped_at:string|null;tracking:string|null;revision:number};
  captures:Capture[]; existing_effect_ref:string|null;
};
export type Clause = {clause_id:string;heading:string;terms:string[];text:string;lines:[number,number];action:Action};
export type Policy = {policy_id:string;version:number;effective_from:string;effective_until:string|null;clauses:Clause[];content_digest:string};
