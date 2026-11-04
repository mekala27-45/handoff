import test from 'node:test';
import assert from 'node:assert/strict';
import {appendV5Experiments,publicV5Trace} from '../../scripts/publish-model-experiment-v5.js';
test('v5 publication retains every prior version and refuses changes to a published v5 entry',()=>{
 const index={'local-model':{version:2},model_experiments:{v3:{count:2}},model_experiments_v4:{v4:{count:12}},diagnostics:{faults:[590]}},before=structuredClone(index),entry={run_id:'model-heldout-v5-1',count:0};
 const next=appendV5Experiments(index,[entry]);assert.deepEqual(index,before);for(const key of Object.keys(index))assert.deepEqual(next[key as keyof typeof next],index[key as keyof typeof index]);
 assert.deepEqual(appendV5Experiments(next,[entry]),next);assert.throws(()=>appendV5Experiments(next,[{...entry,count:16}]),/immutable/);
});
test('public v5 trace removes private fields and error prose while retaining tool observations',()=>{
 const sentinel='private-sentinel',trace={run_id:'model-heldout-v5-1',source_commit:'a'.repeat(40),configuration_digest:'b'.repeat(64),model_digest:'c'.repeat(64),trace:[{at:'2026-11-04T00:00:00Z',type:'model_settled',data:{outcome:'failed',error:{message:sentinel},reasoning:sentinel}},{at:'2026-11-04T00:00:00Z',type:'tool_result',data:{tool:'get_order_facts',result:{snapshot_token:'f1',capability:sentinel,providerMetadata:{value:sentinel}}}},{at:'2026-11-04T00:00:00Z',type:'unregistered_event',data:sentinel}]};
 const result=publicV5Trace(trace);assert.equal(result.entries.length,2);assert.equal(JSON.stringify(result).includes(sentinel),false);assert.ok(JSON.stringify(result).includes('snapshot_token'));assert.equal(trace.trace.length,3);
});
