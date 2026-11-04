import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha256 } from '../../packages/domain/canonical.js';
import { policySearchInputSchema,POLICY_TOPICS } from '../../agent-v5/agent/lib/tool-schemas.js';
import { visiblePolicyClauses } from '../../agent-v5/agent/lib/policy-view.js';
import { verifyV5Selection } from '../../eval/harness/model-selection-v5.js';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
test('v5 selects fresh balanced scopes from metadata and rejects swapped prior cases',()=>{
 const plan=read('eval/plans/model-experiment-v5.json'),registered=read('eval/plans/registered.json'),v3=read('eval/plans/model-experiment-v3.json'),v4=read('eval/plans/model-experiment-v4.json');
 verifyV5Selection(plan,registered,v3,v4);
 const bad=structuredClone(plan);bad.held_out_case_ids[0]=v4.held_out_case_ids[0];assert.throws(()=>verifyV5Selection(bad,registered,v3,v4));
 const reduced=structuredClone(plan);reduced.development_case_ids.pop();assert.throws(()=>verifyV5Selection(reduced,registered,v3,v4));
});
test('policy topics cannot admit arbitrary ticket instructions or action selectors',()=>{
 for(const query of POLICY_TOPICS)assert.equal(policySearchInputSchema.parse({query}).query,query);
 assert.equal(policySearchInputSchema.safeParse({query:'dispatch notice arrived before stop purchase'}).success,false);
 assert.deepEqual(policySearchInputSchema.parse({query:'cancel before',action:'propose_refund'}),{query:'cancel before'});
});
test('policy view preserves exact policy text, action label and evidence without ranking',()=>{
 const policy=read('packages/fixtures/data/policy.json'),items=policy.clauses.map((clause:any)=>({clause,score:1,ref:{clause_id:clause.clause_id,version:policy.version}})),before=structuredClone(items),view=visiblePolicyClauses(items);
 assert.deepEqual(items,before);
 for(let i=0;i<view.length;i++){assert.equal(view[i]!.clause.text,items[i].clause.text);assert.deepEqual(view[i]!.ref,items[i].ref);assert.equal(view[i]!.clause.action,items[i].clause.action);assert.equal(Object.hasOwn(view[i]!,'score'),false);}
});
test('all v3 and v4 frozen sources remain byte-equivalent after LF normalization',()=>{
 for(const v of ['v3','v4'])for(const [file,expected] of Object.entries(read('eval/plans/model-config-'+v+'.json').configuration.files))assert.equal(sha256(readFileSync(file,'utf8').replace(/\r\n/g,'\n')),expected,file);
});
