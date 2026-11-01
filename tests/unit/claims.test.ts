import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, renderClaims, notMeasured } from '../../packages/domain/claims.js';
import { canonical, digest } from '../../packages/domain/canonical.js';
const h = 'a'.repeat(64), commit = 'b'.repeat(40);
const report = {run_id:'test',mode:'scripted',source_commit:commit,dependency_digest:h,dataset_digest:h,configuration_digest:h,policy_digest:h,model_digest:null,started_at:'2026-01-01T00:00:00Z',finished_at:'2026-01-01T00:01:00Z',attempted_case_ids:['c1'],metrics:[{metric_id:'correct',mode:'scripted',split:'held-out',numerator:1,denominator:1,unit:'cases',source:'independent oracle',input_digest:h}],evidence_paths:['test.json'],status:'passed'};
test('claims render only validated evidence', () => assert.match(renderClaims(validateReport(report,{commit,configuration:h})),/1 \/ 1 cases/));
test('claims reject empty, zero denominator, mixed modes, missing provenance and stale evidence', () => {
  for (const input of [{},{...report,metrics:[]},{...report,metrics:[{...report.metrics[0],denominator:0}]},{...report,mode:'local-model'},{...report,configuration_digest:'c'.repeat(64)},{...report,source_commit:'c'.repeat(40)},{...report,attempted_case_ids:['c1','c1']}]) assert.throws(()=>validateReport(input,{commit,configuration:h}));
});
test('unknown evidence cannot become zero failures',()=>{assert.match(notMeasured('Model has not run.'),/Not evaluated/); assert.throws(()=>notMeasured(''));});
test('model evidence requires a real digest shape',()=>{assert.throws(()=>renderClaims({...report,model_digest:'not-a-digest'} as any));});
test('canonicalization is stable and refuses ambiguous inputs',()=>{
  assert.equal(digest({b:2,a:1}),digest({a:1,b:2}));
  assert.notEqual(digest([1,2]),digest([2,1]));
  for(const x of [NaN,Infinity,undefined,-0,new Date()]) assert.throws(()=>canonical(x));
});
