import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseGuidance } from '../../agent/lib/phase-guidance.js';
import { proposalInputSchema } from '../../agent/lib/tool-schemas.js';

test('phase guidance follows completed observations without choosing a resolution',()=>{
 assert.match(phaseGuidance([])!,/^Next tool: get_order_facts\./);
 const facts={tool:'get_order_facts',result:{snapshot_token:'f1',private_text:'do not reproduce'}};
 assert.match(phaseGuidance([facts])!,/^Next tool: find_policy_clauses\./);
 assert.match(phaseGuidance([facts,{tool:'find_policy_clauses',result:[]}])!,/^Next tool: find_policy_clauses\./);
 const next=phaseGuidance([facts,{tool:'find_policy_clauses',result:[{arbitrary:'retrieved content'}]}])!;
 assert.match(next,/^Next tool: propose_resolution\./);assert.match(next,/snapshot_token f1/);
 for(const text of ['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review','P-DAMAGE','do not reproduce','retrieved content'])assert.ok(!next.includes(text));
 assert.equal(phaseGuidance([facts,{tool:'propose_resolution',result:{valid:false}}]),null);
});

test('phase guidance never reflects untrusted snapshot text and keeps refusal action model selected',()=>{
 const policy={tool:'find_policy_clauses',result:[{}]};
 const malicious=phaseGuidance([{tool:'get_order_facts',result:{snapshot_token:'secret-value-do-not-copy'}},policy])!;
 assert.ok(!malicious.includes('secret-value-do-not-copy'));
 const refused=phaseGuidance([{tool:'get_order_facts',result:{refused:true,snapshot_token:'r1'}},policy])!;
 assert.match(refused,/snapshot_token r1/);assert.ok(!refused.includes('request_identity_review'));
});

test('proposal tool exposes no optional amount and still requires model action/citations',()=>{
 const proposal={action_code:'propose_refund',cited_clause_ids:['P-DAMAGE'],snapshot_token:'f1',rationale:'Damage within policy.'};
 assert.equal(proposalInputSchema.safeParse(proposal).success,true);
 assert.equal(proposalInputSchema.safeParse({...proposal,suggested_amount_cents:1200}).success,false);
 assert.equal(proposalInputSchema.safeParse({...proposal,action_code:undefined}).success,false);
 assert.equal(proposalInputSchema.safeParse({...proposal,cited_clause_ids:[]}).success,false);
});
