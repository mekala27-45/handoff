import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseReadiness } from '../../packages/domain/release.js';
const c='a'.repeat(40),live={url:'https://example.test',source_commit:c,verified:true};
const valid={candidate_commit:c,verification_commit:c,clean_rederivation_commit:c,full_suite_passed:true,live_api:live,pages:live,publication_authorized:true,gates:Array.from({length:17},(_,i)=>({step:i+1,done:true,evidence:'unit fixture'}))};
test('release gate requires complete evidence, matching commits and explicit authorization',()=>{
 assert.equal(releaseReadiness(valid).ready,true);
 for(const bad of [{},{...valid,gates:[]},{...valid,publication_authorized:false},{...valid,live_api:null},{...valid,verification_commit:'b'.repeat(40)},{...valid,gates:valid.gates.map(x=>({...x,step:1}))}])assert.equal(releaseReadiness(bad).ready,false);
});
