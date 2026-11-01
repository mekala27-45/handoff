import { digest } from './canonical.js';
import { requireThat } from './errors.js';
import type { Fixture,Policy,Clause } from '../fixtures/types.js';
export type EvidenceRef={policy_id:string;version:number;clause_id:string;content_digest:string;policy_digest:string;lines:[number,number]};
export type Versions={order_id:string;order_revision:number;capture_versions:Record<string,number>;policy_id:string;policy_version:number;policy_revision:number;policy_digest:string};
export const reference=(p:Policy,c:Clause):EvidenceRef=>({policy_id:p.policy_id,version:p.version,clause_id:c.clause_id,content_digest:digest(c),policy_digest:p.content_digest,lines:c.lines});
export function snapshotVersions(f:Fixture,p:Policy,headRevision:number):Versions {
 return {order_id:f.order.order_id,order_revision:f.order.revision,capture_versions:Object.fromEntries([...f.captures].sort((a,b)=>a.capture_id.localeCompare(b.capture_id)).map(c=>[c.capture_id,c.revision])),policy_id:p.policy_id,policy_version:p.version,policy_revision:headRevision,policy_digest:p.content_digest};
}
export function scopedFacts(f:Fixture,orderId:string) {
 requireThat(orderId===f.order.order_id&&f.trusted_customer_id===f.order.customer_id,'not_found',404);
 return {order:structuredClone(f.order),captures:structuredClone(f.captures),received_at:f.received_at,existing_effect_ref:f.existing_effect_ref};
}
export function findClauses(p:Policy,query:string,receivedAt:string):{ref:EvidenceRef;clause:Clause;score:number}[] {
 requireThat(query.length>0&&query.length<=200,'invalid_query');
 const time=Date.parse(receivedAt);
 requireThat(Number.isFinite(time)&&time>=Date.parse(p.effective_from)&&(!p.effective_until||time<Date.parse(p.effective_until)),'policy_unavailable',409);
 const words=query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
 return p.clauses.map(clause=>({clause,ref:reference(p,clause),score:words.reduce((s,w)=>s+(clause.terms.includes(w)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.clause.clause_id.localeCompare(b.clause.clause_id)).slice(0,3);
}
export function verifyReference(p:Policy,ref:EvidenceRef):boolean {
 const c=p.clauses.find(x=>x.clause_id===ref.clause_id);return !!c&&digest(reference(p,c))===digest(ref);
}
