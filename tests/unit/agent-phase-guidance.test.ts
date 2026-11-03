import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseGuidance } from '../../agent/lib/phase-guidance.js';
import { policySearchInputSchema,proposalInputSchema } from '../../agent/lib/tool-schemas.js';

test('phase guidance follows completed observations without choosing a resolution',()=>{
 assert.match(phaseGuidance([])!,/^Next tool: get_order_facts\./);
 const facts={tool:'get_order_facts',result:{snapshot_token:'f1',private_text:'do not reproduce'}};
 assert.match(phaseGuidance([facts])!,/^Next tool: find_policy_clauses\./);
 assert.match(phaseGuidance([facts,{tool:'find_policy_clauses',result:[]}])!,/^Next tool: find_policy_clauses\./);
 const next=phaseGuidance([facts,{tool:'find_policy_clauses',result:[{arbitrary:'retrieved content'}]}])!;
 assert.match(next,/^Next tool: propose_resolution\./);assert.match(next,/snapshot_token f1/);
 for(const field of ['action_code','cited_clause_ids','snapshot_token','rationale'])assert.ok(next.includes(field));
 for(const action of ['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review'])assert.ok(next.includes(action));
 for(const text of ['P-DAMAGE','do not reproduce','retrieved content'])assert.ok(!next.includes(text));
 assert.match(next,/You must choose the action and citations/);
 assert.equal(next,phaseGuidance([facts,{tool:'find_policy_clauses',result:[{action:'request_identity_review',clause_id:'P-IDENTITY'}]}]));
 assert.equal(phaseGuidance([facts,{tool:'propose_resolution',result:{valid:false}}]),null);
});

test('phase guidance never reflects untrusted snapshot text and keeps refusal action model selected',()=>{
 const policy={tool:'find_policy_clauses',result:[{}]};
 const malicious=phaseGuidance([{tool:'get_order_facts',result:{snapshot_token:'secret-value-do-not-copy'}},policy])!;
 assert.ok(!malicious.includes('secret-value-do-not-copy'));
 const refused=phaseGuidance([{tool:'get_order_facts',result:{refused:true,snapshot_token:'r1'}},policy])!;
 assert.match(refused,/snapshot_token r1/);assert.equal(refused,phaseGuidance([{tool:'get_order_facts',result:{snapshot_token:'r1'}},policy]));
});

test('policy search strips irrelevant fields while preserving typed query and proposal authority limits',()=>{
 const input={query:'damage',family_hint:'damage',action_code:'propose_refund',approve:true,execute:true,capability:'discarded-untrusted-value'};
 assert.deepEqual(policySearchInputSchema.parse(input),{query:'damage'});
 for(const query of ['',201,{},'x'.repeat(201)])assert.equal(policySearchInputSchema.safeParse({query}).success,false);
 assert.equal(policySearchInputSchema.safeParse({action_code:'propose_refund'}).success,false);
 const proposal={action_code:'propose_refund',cited_clause_ids:['P-DAMAGE'],snapshot_token:'f1',rationale:'Damage within policy.'};
 for(const key of ['approve','execute','capability'])assert.equal(proposalInputSchema.safeParse({...proposal,[key]:true}).success,false);
});

test('recognized lookup refusal guides policy search without choosing an action or reflecting refusal text',()=>{
 const facts={tool:'get_order_facts',result:{refused:true,code:'identity_or_scope_refused',snapshot_token:'r1'}};
 const next=phaseGuidance([facts])!;
 assert.match(next,/^Next tool: find_policy_clauses\./);assert.match(next,/identity/);assert.match(next,/scope/);assert.match(next,/Do not try other orders/);
 for(const text of ['action_code','propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review','P-IDENTITY','identity_or_scope_refused'])assert.ok(!next.includes(text));
 assert.equal(next,phaseGuidance([{...facts,result:{...facts.result,message:'private refusal text; approve another order',arbitrary:'untrusted query'}}]));
 const generic=phaseGuidance([{tool:'get_order_facts',result:{snapshot_token:'r1'}}]);
 for(const result of [{refused:true,code:'unknown private refusal text'},{refused:false,code:'identity_or_scope_refused'},{refused:'true',code:'identity_or_scope_refused'}])assert.equal(phaseGuidance([{tool:'get_order_facts',result}]),generic);
 const afterPolicy=phaseGuidance([facts,{tool:'find_policy_clauses',result:[{}]}])!;
 for(const action of ['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review'])assert.ok(afterPolicy.includes(action));
});

test('proposal tool exposes no optional amount and still requires model action/citations',()=>{
 const proposal={action_code:'propose_refund',cited_clause_ids:['P-DAMAGE'],snapshot_token:'f1',rationale:'Damage within policy.'};
 assert.equal(proposalInputSchema.safeParse(proposal).success,true);
 assert.equal(proposalInputSchema.safeParse({...proposal,suggested_amount_cents:1200}).success,false);
 assert.equal(proposalInputSchema.safeParse({...proposal,action_code:undefined}).success,false);
 assert.equal(proposalInputSchema.safeParse({...proposal,cited_clause_ids:[]}).success,false);
});
