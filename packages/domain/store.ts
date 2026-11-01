import { randomUUID,randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { transaction,type Db } from '../db/client.js';
import { digest,sha256 } from './canonical.js';
import { requireThat,DomainError } from './errors.js';
import type { Fixture,Policy } from '../fixtures/types.js';
import { scopedFacts } from './evidence.js';
export const fixtures:Fixture[]=JSON.parse(readFileSync('packages/fixtures/data/cases.json','utf8'));
export const publicFixtures=fixtures.filter(f=>f.order.captured_cents<10).filter((f,i,a)=>a.findIndex(x=>x.title===f.title)===i).map(f=>({fixture_id:f.fixture_id,title:f.title,description:f.ticket}));
export type Scope={session_id:string;write_count:number};
export type CaseRow={session_id:string;case_id:string;source_event_id:string;fixture_id:string;state:string;revision:number;controller_mode:'scripted'|'local-model';config_digest:string;fixture:Fixture;created_at:Date};
export type ServiceOptions={testMode?:boolean;sessionRate?:number;beforeCommit?:(db:Db)=>Promise<void>;afterCommit?:()=>Promise<void>;readFault?:()=>Promise<void>};
export const configDigest=digest({version:1,canonical:'sorted-object-keys-v1',approval_seconds:900,retention_seconds:86400,max_cases:20,max_writes:200});
export const uid=(prefix:string)=>`${prefix}_${randomUUID()}`;
const iso=(x:unknown):string|null=>x===null?null:(x instanceof Date?x.toISOString():String(x));
export class Store {
 constructor(public pool:pg.Pool,public options:ServiceOptions={}){requireThat(!options.sessionRate||options.testMode,'invalid_test_config');}
 async createSession(){
  const capability=randomBytes(32).toString('base64url'),sid=uid('session');
  return transaction(this.pool,async db=>{
   const bucket=this.options.testMode?'test-sessions':'sessions';
   await db.query('INSERT INTO handoff.global_budget(bucket,window_start,count) VALUES($1,clock_timestamp(),0) ON CONFLICT DO NOTHING',[bucket]);
   const budget=(await db.query("SELECT *,clock_timestamp()-window_start >= interval '1 minute' AS reset FROM handoff.global_budget WHERE bucket=$1 FOR UPDATE",[bucket])).rows[0];
   const count=budget.reset?0:budget.count;requireThat(count<(this.options.sessionRate??10),'session_budget_exhausted',429);
   await db.query('UPDATE handoff.global_budget SET count=$1,window_start=CASE WHEN $2 THEN clock_timestamp() ELSE window_start END WHERE bucket=$3',[count+1,budget.reset,bucket]);
   const row=(await db.query("INSERT INTO handoff.demo_sessions(session_id,capability_hash,expires_at,fixture_namespace) VALUES($1,$2,clock_timestamp()+interval '1 day',$1) RETURNING session_id,expires_at",[sid,sha256(capability)])).rows[0];
   return {...row,capability};
  });
 }
 async scope(db:Db,cap:string,lock=false):Promise<Scope>{
  requireThat(typeof cap==='string'&&cap.length>=32&&cap.length<=100,'unauthorized',401);
  const r=await db.query(`SELECT session_id,write_count FROM handoff.demo_sessions WHERE capability_hash=$1 AND status='active' AND expires_at>clock_timestamp()${lock?' FOR UPDATE':''}`,[sha256(cap)]);
  requireThat(r.rowCount===1,'unauthorized',401);return r.rows[0];
 }
 async case(db:Db,sid:string,id:string,lock=false):Promise<CaseRow>{
  const r=await db.query(`SELECT * FROM handoff.cases WHERE session_id=$1 AND case_id=$2${lock?' FOR UPDATE':''}`,[sid,id]);requireThat(r.rowCount===1,'not_found',404);return r.rows[0];
 }
 async world(db:Db,c:CaseRow,lock=false):Promise<{fixture:Fixture;policy:Policy;policyRevision:number}>{
  const head=(await db.query(`SELECT * FROM handoff.policy_heads WHERE policy_id='SAMPLE-SUPPLY'${lock?' FOR SHARE':''}`)).rows[0];requireThat(head,'policy_unavailable',503);
  const p=(await db.query('SELECT * FROM handoff.policy_versions WHERE policy_id=$1 AND version=$2',[head.policy_id,head.active_version])).rows[0];
  const order=(await db.query(`SELECT * FROM handoff.orders WHERE session_id=$1 AND order_id=$2${lock?' FOR UPDATE':''}`,[c.session_id,c.fixture.order.order_id])).rows[0];
  const caps=(await db.query(`SELECT * FROM handoff.captures WHERE session_id=$1 AND order_id=$2 ORDER BY capture_id${lock?' FOR UPDATE':''}`,[c.session_id,c.fixture.order.order_id])).rows;
  const last=(await db.query('SELECT effect_id FROM handoff.effects WHERE session_id=$1 AND capture_id=ANY($2::text[]) ORDER BY committed_at DESC LIMIT 1',[c.session_id,caps.map(x=>x.capture_id)])).rows[0];
  const fixture:Fixture={...c.fixture,order:{order_id:order.order_id,customer_id:order.customer_id,currency:order.currency,captured_cents:order.captured_cents,refunded_cents:order.refunded_cents,shipping_state:order.shipping_state,delivered_at:iso(order.delivered_at),shipped_at:iso(order.shipped_at),tracking:order.tracking,revision:order.revision},captures:caps.map(x=>({capture_id:x.capture_id,amount_cents:x.amount_cents,refunded_cents:x.refunded_cents,confirmed_at:iso(x.confirmed_at)!,revision:x.revision,duplicate:x.duplicate})),existing_effect_ref:last?.effect_id??c.fixture.existing_effect_ref};
  return {fixture,policy:{policy_id:p.policy_id,version:p.version,effective_from:iso(p.effective_from)!,effective_until:iso(p.effective_until),clauses:p.clauses,content_digest:p.content_digest},policyRevision:head.revision};
 }
 async event(db:Db,c:CaseRow,type:string,payload:unknown,actor='system'){
  await db.query('INSERT INTO handoff.case_events(session_id,case_id,sequence,event_id,event_type,actor_kind,payload_digest,safe_payload) SELECT $1,$2,COALESCE(MAX(sequence),0)+1,$3,$4,$5,$6,$7 FROM handoff.case_events WHERE session_id=$1 AND case_id=$2',[c.session_id,c.case_id,uid('evt'),type,actor,digest(payload),JSON.stringify(payload)]);
 }
 async transition(db:Db,c:CaseRow,state:string,type:string,payload:unknown,actor='system'){
  await db.query('UPDATE handoff.cases SET state=$3,revision=revision+1 WHERE session_id=$1 AND case_id=$2',[c.session_id,c.case_id,state]);c.state=state;c.revision++;await this.event(db,c,type,payload,actor);
 }
 async mutation(cap:string,operation:string,key:string,payload:unknown,fn:(db:Db,s:Scope)=>Promise<unknown>):Promise<any>{
  requireThat(/^[A-Za-z0-9_-]{8,100}$/.test(key),'invalid_idempotency_key');const payloadHash=digest(payload);
  return transaction(this.pool,async db=>{
   const s=await this.scope(db,cap,true);
   const old=(await db.query('SELECT * FROM handoff.request_receipts WHERE session_id=$1 AND operation=$2 AND idempotency_key=$3',[s.session_id,operation,key])).rows[0];
   if(old){requireThat(old.payload_digest===payloadHash,'idempotency_conflict',409);return old.response_body;}
   requireThat(s.write_count<200,'write_budget_exhausted',429);
   const result=await fn(db,s);
   const status=result&&typeof result==='object'&&'code' in result?409:200;
   await db.query('INSERT INTO handoff.request_receipts(session_id,operation,idempotency_key,payload_digest,response_status,response_body) VALUES($1,$2,$3,$4,$5,$6)',[s.session_id,operation,key,payloadHash,status,JSON.stringify(result)]);
   await db.query('UPDATE handoff.demo_sessions SET write_count=write_count+1,last_seen_at=clock_timestamp() WHERE session_id=$1',[s.session_id]);
   return result;
  });
 }
 async intake(cap:string,input:{fixture_id:string;source_event_id:string},key:string,mode:'scripted'|'local-model'='scripted'){
  requireThat(mode==='scripted'||this.options.testMode,'mode_unavailable');
  const f=fixtures.find(f=>f.fixture_id===input.fixture_id);requireThat(f,'unknown_fixture');
  return this.mutation(cap,'intake',key,input,async(db,s)=>{
   const old=(await db.query('SELECT case_id,fixture_id FROM handoff.cases WHERE session_id=$1 AND source_event_id=$2',[s.session_id,input.source_event_id])).rows[0];
   if(old){requireThat(old.fixture_id===f.fixture_id,'source_event_conflict',409);return {case_id:old.case_id,state:'received'};}
   const count=(await db.query('SELECT count(*)::int AS n FROM handoff.cases WHERE session_id=$1',[s.session_id])).rows[0].n;requireThat(count<20,'case_budget_exhausted',429);
   const o=f.order;
   await db.query('INSERT INTO handoff.orders(session_id,order_id,customer_id,currency,captured_cents,refunded_cents,shipping_state,delivered_at,shipped_at,tracking,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING',[s.session_id,o.order_id,o.customer_id,o.currency,o.captured_cents,o.refunded_cents,o.shipping_state,o.delivered_at,o.shipped_at,o.tracking,o.revision]);
   for(const v of f.captures)await db.query('INSERT INTO handoff.captures(session_id,capture_id,order_id,amount_cents,refunded_cents,initial_refunded_cents,confirmed_at,revision,duplicate) VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8) ON CONFLICT DO NOTHING',[s.session_id,v.capture_id,o.order_id,v.amount_cents,v.refunded_cents,v.confirmed_at,v.revision,v.duplicate]);
   const id=uid('case');const c=(await db.query("INSERT INTO handoff.cases(session_id,case_id,source_event_id,trusted_customer_id,fixture_id,received_at,state,controller_mode,config_digest,fixture) VALUES($1,$2,$3,$4,$5,$6,'received',$7,$8,$9) RETURNING *",[s.session_id,id,input.source_event_id,f.trusted_customer_id,f.fixture_id,f.received_at,mode,configDigest,JSON.stringify(f)])).rows[0];
   await this.event(db,c,'received',{fixture_id:f.fixture_id,source_event_id:input.source_event_id},mode);return {case_id:id,state:'received'};
  });
 }
 async view(cap:string,id:string){
  return transaction(this.pool,async db=>{
   const s=await this.scope(db,cap),c=await this.case(db,s.session_id,id),w=await this.world(db,c);
   const authorized=w.fixture.trusted_customer_id===w.fixture.order.customer_id;
   const proposal=(await db.query('SELECT proposal_id,action_code,amount_cents,currency,capture_id,evidence_refs,fact_versions,content_digest,controller_mode,validation_result,validation_reason_codes,created_at FROM handoff.proposals WHERE session_id=$1 AND case_id=$2 ORDER BY created_at DESC,proposal_id DESC LIMIT 1',[s.session_id,id])).rows[0]??null;
   const review=proposal?(await db.query('SELECT review_id,decision,reviewer_kind,proposal_digest,expires_at,decided_at FROM handoff.reviews WHERE session_id=$1 AND proposal_id=$2 ORDER BY decided_at DESC LIMIT 1',[s.session_id,proposal.proposal_id])).rows[0]??null:null;
   const receipt=(await db.query('SELECT result FROM handoff.effects WHERE session_id=$1 AND case_id=$2 UNION ALL SELECT result FROM handoff.dispositions WHERE session_id=$1 AND case_id=$2',[s.session_id,id])).rows[0]?.result??null;
   return {case_id:id,title:c.fixture.title,ticket:c.fixture.ticket,state:c.state,revision:c.revision,mode:c.controller_mode,created_at:c.created_at,received_at:c.fixture.received_at,facts:authorized?scopedFacts(w.fixture,w.fixture.order.order_id):null,scope:authorized?'matched':'identity_review_required',policy:{...w.policy,revision:w.policyRevision},proposal:authorized?proposal:null,review:authorized?review:null,receipt:authorized?receipt:null,next_actions:this.nextActions(c.state),draft:!authorized?'Manual identity review required. No order facts disclosed.':null};
  });
 }
 nextActions(state:string){return ({received:['step'],gathering:['step'],awaiting_review:['approve','reject'],approved:['execute'],review_needed:['revise'],rejected:['revise'],expired:['revise'],completed:['recover'],blocked:[] } as Record<string,string[]>)[state]??[];}
 async list(cap:string){return transaction(this.pool,async db=>{const s=await this.scope(db,cap);return (await db.query("SELECT case_id,state,revision,controller_mode AS mode,created_at,fixture->>'title' AS title FROM handoff.cases WHERE session_id=$1 ORDER BY created_at DESC",[s.session_id])).rows;});}
 async events(cap:string,id:string,after=0){return transaction(this.pool,async db=>{const s=await this.scope(db,cap);await this.case(db,s.session_id,id);return (await db.query('SELECT sequence,event_id,event_type,actor_kind,safe_payload,created_at FROM handoff.case_events WHERE session_id=$1 AND case_id=$2 AND sequence>$3 ORDER BY sequence LIMIT 100',[s.session_id,id,after])).rows;});}
 async recover(cap:string,key:string){return transaction(this.pool,async db=>{const s=await this.scope(db,cap);const receipt=(await db.query('SELECT operation,response_body FROM handoff.request_receipts WHERE session_id=$1 AND idempotency_key=$2 ORDER BY committed_at DESC',[s.session_id,key])).rows;requireThat(receipt.length,'operation_not_found',404);return {status:'committed',receipts:receipt};});}
}
