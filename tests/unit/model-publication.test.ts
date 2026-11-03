import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareModelExperiment } from '../../scripts/publish-model-experiment.js';
import { digest } from '../../packages/domain/canonical.js';
const h='a'.repeat(64),c='b'.repeat(40);
function evidence(){
 const ids=Array.from({length:16},(_,i)=>'fx_'+String(i).padStart(2,'0'));
 const plan:any={stage:'registered-candidate',model_digest:h,development_case_ids:ids,held_out_case_ids:ids,prior_attempts:[],changes:['Short observed snapshot token.']};
 const registered:any={dataset_digest:h,policy_digest:h,model_subset:['old'],cases:ids.map((fixture_id,i)=>({fixture_id,family:'family_'+Math.floor(i/2),split:'held-out'}))};
 const rows=ids.map(fixture_id=>({fixture_id,trace:'reports/model-traces/test-'+fixture_id+'.json',terminal_record:true,action:'draft_confirmation',proposal_correct:true,evidence_valid:true,unsafe_proposal:false,unclassified:false,model_calls:1,tool_requests:1}));
 const configuration={files:{'eval/plans/model-experiment-v3.json':h}},frozen={configuration,configuration_digest:digest(configuration)};
 const manifest:any={run_id:'test',mode:'local-model',source_commit:c,dependency_digest:h,dataset_digest:h,configuration_digest:frozen.configuration_digest,policy_digest:h,model_digest:h,started_at:'2026-01-01T00:00:00Z',finished_at:'2026-01-01T00:01:00Z',attempted_case_ids:ids,evidence_paths:rows.map(r=>r.trace),status:'passed',metrics:['proposal_correctness','actual_tool_execution','valid_required_evidence','unsafe_proposed_action','unclassified_missing_output'].map(metric_id=>({metric_id,mode:'local-model',split:'held-out',numerator:['unsafe_proposed_action','unclassified_missing_output'].includes(metric_id)?0:16,denominator:16,unit:'cases',source:'independent test fixture',input_digest:h}))};
 const traces=ids.map(id=>({run_id:'test-'+id,source_commit:c,configuration_digest:manifest.configuration_digest,model_digest:h,dataset_digest:h,policy_digest:h,trace:[{at:"2026-01-01T00:00:00Z",type:"effective_tool_inventory",data:{inventory:["find_policy_clauses","get_order_facts","propose_resolution"]}},{at:"2026-01-01T00:00:00Z",type:"model_tool_request",data:{tool:"propose_resolution"}},{at:'2026-01-01T00:00:00Z',type:'model_started',data:{runId:'run_0',reasoning:'private model text',error:'raw error'}},{at:'2026-01-01T00:00:01Z',type:'tool_result',data:{tool:'propose_resolution',result:{valid:true,reasoning:'hidden',error:'raw',capability:'private'}}},{at:'2026-01-01T00:00:02Z',type:'eve_call_settled',data:{call_id:'call_1',outcome:'failed',error:{code:'invalid_input',message:'raw database stack'}}}]}));
 return {manifest,rows,traces,plan,registered,frozen,planHash:h};
}
test('publication preserves exact grades and sanitizes private trace fields',()=>{
 const r=prepareModelExperiment(evidence());assert.equal(r.entry.experiment_kind,'held-out');assert.equal(r.entry.trace_cases.length,16);assert.equal(r.rows.length,16);
 const s=JSON.stringify(r);for(const text of ['private model text','raw error','raw database stack','capability','hidden'])assert.ok(!s.includes(text));assert.ok(s.includes('invalid_input'));
});
test('publication rejects empty, incomplete, tampered grade and foreign trace evidence',()=>{
 for(const mutate of [(x:any)=>x.rows=[],(x:any)=>x.rows[0].proposal_correct=false,(x:any)=>x.traces[0].source_commit='c'.repeat(40),(x:any)=>x.traces[0].run_id='foreign',(x:any)=>x.manifest.attempted_case_ids.reverse(),(x:any)=>x.frozen=null,(x:any)=>x.planHash='d'.repeat(64),(x:any)=>x.registered.model_subset.push('fx_00'),(x:any)=>x.rows[0].terminal_record=false]){const x=evidence();mutate(x);assert.throws(()=>prepareModelExperiment(x));}
});
test('honest failed evaluations publish with their full denominator',()=>{
 const x=evidence();for(const row of x.rows){row.proposal_correct=false;row.evidence_valid=false;row.unclassified=true;(row as any).action=null;}x.manifest.status='failed';for(const m of x.manifest.metrics){if(['proposal_correctness','valid_required_evidence'].includes(m.metric_id))m.numerator=0;if(m.metric_id==='unclassified_missing_output')m.numerator=16;}assert.equal(prepareModelExperiment(x).entry.status,'failed');
});
test('only declared historical development scopes bypass the balanced sixteen requirement',()=>{
 const x=evidence();x.plan.prior_attempts=[{source_commit:c,case_ids:['fx_00'],acceptable_proposals:1,operating_point:'historical-test'}];x.manifest.attempted_case_ids=['fx_00'];x.rows=x.rows.slice(0,1);x.traces=x.traces.slice(0,1);x.manifest.evidence_paths=x.rows.map(r=>r.trace);for(const m of x.manifest.metrics){m.split='development';m.denominator=1;m.numerator=m.numerator?1:0;}x.registered.cases[0].split='development';assert.equal(prepareModelExperiment(x).entry.experiment_kind,'prior-development');x.plan.prior_attempts=[];assert.throws(()=>prepareModelExperiment(x));
});
