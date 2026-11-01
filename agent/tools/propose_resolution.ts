import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { application,budget,record,observedResults } from '../lib/runtime.js';
import { versionsSchema } from '../../packages/domain/policy.js';
import { reference,snapshotVersions } from '../../packages/domain/evidence.js';
import { transaction } from '../../packages/db/client.js';
export default defineTool({description:'Submit a typed proposal for deterministic validation. This cannot approve, execute or send. Copy fact_versions from get_order_facts; use null only for identity refusal. Cite returned clause IDs.',endsTurn:true,inputSchema:z.object({action_code:z.enum(['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review']),cited_clause_ids:z.array(z.string()).min(1).max(3),fact_versions:versionsSchema.nullable(),rationale:z.string().max(500),suggested_amount_cents:z.number().int().nonnegative().optional()}).strict(),async execute(input){
 const s=await budget('tools');await record('model_tool_request',{tool:'propose_resolution',input});
 const observed=await observedResults();
 if(!observed.some(x=>x.tool==='get_order_facts'))throw new Error('facts_not_retrieved');
 const cited=observed.filter(x=>x.tool==='find_policy_clauses').flatMap(x=>x.result);
 if(input.cited_clause_ids.some(id=>!cited.some(x=>x.ref.clause_id===id)))throw new Error('citation_not_retrieved');
 const current=await transaction(application.pool,async db=>{const ctx=await application.scope(db,s.capability),c=await application.case(db,ctx.session_id,s.case_id),w=await application.world(db,c);return {c,w};});
 if(!input.fact_versions&&(input.action_code!=='request_identity_review'||current.w.fixture.trusted_customer_id===current.w.fixture.order.customer_id))throw new Error('missing_fact_versions');
 const refs=input.cited_clause_ids.map(id=>{const clause=current.w.policy.clauses.find(c=>c.clause_id===id);if(!clause)throw new Error('missing_citation');return reference(current.w.policy,clause);});
 const result=await application.propose(s.capability,s.case_id,{action_code:input.action_code,evidence_refs:refs,fact_versions:input.fact_versions??snapshotVersions(current.w.fixture,current.w.policy,current.w.policyRevision),rationale:input.rationale,...(input.suggested_amount_cents===undefined?{}:{suggested_amount_cents:input.suggested_amount_cents})},current.c.revision,s.run_id+'_proposal');
 await record('tool_result',{tool:'propose_resolution',result});return result;
}});
