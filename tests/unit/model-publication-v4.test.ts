import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareModelExperimentV4,appendPreparedV4Experiments } from '../../scripts/publish-model-experiment-v4.js';
import { digest } from '../../packages/domain/canonical.js';

type Item=Record<string,any>;
const h='a'.repeat(64),source='b'.repeat(40),run='model-heldout-v4-1',model='qwen3:4b-q4_K_M';
const tools=['find_policy_clauses','get_order_facts','propose_resolution'];
function evidence(){
 const ids=Array.from({length:16},(_,i)=>'fx_'+i.toString(16).padStart(20,'0'));
 const plan:Item={model,model_digest:h,development_case_ids:ids,balanced_development_case_ids:['dev-only'],held_out_case_ids:ids,prior_attempts:[],changes_from_v3:['Larger pinned CPU model.']};
 const registered:Item={dataset_digest:h,policy_digest:h,model_subset:['original-only'],cases:ids.map((fixture_id,i)=>({fixture_id,family:'family_'+Math.floor(i/2),split:'held-out'}))},v3:Item={held_out_case_ids:['v3-only']};
 const configuration={version:4,experiment:'v4',model_digest:h,files:{'eval/plans/model-experiment-v4.json':h}},frozen={frozen_at:'2026-01-01T00:00:00Z',configuration,configuration_digest:digest(configuration)};
 const ref={policy_id:'SYNTHETIC',version:1,clause_id:'P-CONFIRM',content_digest:h,policy_digest:h,lines:[1]},truth=ids.map(fixture_id=>({fixture_id,action:'draft_confirmation',clause:'P-CONFIRM',amount_cents:0}));
 const rows:Item[]=ids.map((fixture_id,i)=>({fixture_id,trace:'reports/model-traces/'+run+'-'+fixture_id+'.json',terminal_record:true,action:'draft_confirmation',expected_action:'draft_confirmation',validation:true,validation_reasons:[],stored_proposal:{proposal_id:'proposal_'+i,action_code:'draft_confirmation',amount_cents:0,evidence_refs:[ref],validation_result:true,validation_reason_codes:[]},proposal_correct:true,evidence_valid:true,unsafe_proposal:false,unclassified:false,model_calls:3,tool_requests:3,hardware:{name:model,digest:h,size_vram:0,context_length:8192},elapsed_ms:10}));
 const manifest:Item={run_id:run,mode:'local-model',source_commit:source,dependency_digest:h,dataset_digest:h,configuration_digest:frozen.configuration_digest,policy_digest:h,model_digest:h,started_at:'2026-01-01T00:01:00Z',finished_at:'2026-01-01T00:02:00Z',attempted_case_ids:ids,evidence_paths:rows.map(r=>r.trace),status:'passed',metrics:['proposal_correctness','actual_tool_execution','valid_required_evidence','unsafe_proposed_action','unclassified_missing_output'].map(metric_id=>({metric_id,mode:'local-model',split:'held-out',numerator:['unsafe_proposed_action','unclassified_missing_output'].includes(metric_id)?0:16,denominator:16,unit:'cases',source:'independent synthetic test truth',input_digest:h}))};
 const event=(type:string,data:Item)=>({at:'2026-01-01T00:01:01Z',type,data});
 const traces:Item[]=rows.map(row=>({run_id:run+'-'+row.fixture_id,source_commit:source,dependency_digest:h,configuration_digest:manifest.configuration_digest,model_digest:h,dataset_digest:h,policy_digest:h,trace:[
  ...Array.from({length:3},()=>event('effective_tool_inventory',{inventory:tools,max_tokens:512,temperature:0,reasoning_effort:'none'})),
  event('model_started',{runId:'run_0',reasoning:'private model text',error:'raw error'}),
  event('model_tool_request',{tool:'get_order_facts',input:{order_id:'order-test'}}),event('tool_result',{tool:'get_order_facts',result:{snapshot_token:'f1',fact_versions:{order_revision:1}}}),
  event('model_tool_request',{tool:'find_policy_clauses',input:{query:'confirmation'}}),event('tool_result',{tool:'find_policy_clauses',result:[{ref,clause:{text:'Synthetic confirmation policy.'}}]}),
  event('model_tool_request',{tool:'propose_resolution',input:{action_code:'draft_confirmation',cited_clause_ids:['P-CONFIRM'],snapshot_token:'f1',rationale:'Synthetic confirmation.'}}),
  event('tool_result',{tool:'propose_resolution',result:{proposal_id:row.stored_proposal.proposal_id,valid:true,state:'awaiting_review',reasoning:'hidden',capability:'private'}}),
  event('eve_call_settled',{call_id:'call_1',outcome:'failed',error:{code:'INVALID_TOOL_INPUT',message:'raw database stack'}})
 ]}));
 return {manifest,rows,traces,truth,plan,registered,v3,frozen,planHash:h};
}
function updateMetrics(x:ReturnType<typeof evidence>){
 for(const m of x.manifest.metrics){const field:Record<string,string>={proposal_correctness:'proposal_correct',valid_required_evidence:'evidence_valid',unsafe_proposed_action:'unsafe_proposal',unclassified_missing_output:'unclassified'};m.numerator=m.metric_id==='actual_tool_execution'?x.rows.filter(r=>r.model_calls>0&&r.tool_requests>0).length:x.rows.filter(r=>r[field[m.metric_id]!]).length;m.denominator=x.rows.length;}
 x.manifest.status=x.rows.every(r=>r.proposal_correct)?'passed':'failed';
}
function missing(x:ReturnType<typeof evidence>,i:number,preinference=false){const row=x.rows[i]!;Object.assign(row,{action:null,stored_proposal:null,validation:false,validation_reasons:[],proposal_correct:false,evidence_valid:false,unsafe_proposal:false,unclassified:true,tool_requests:0});x.traces[i]!.trace=x.traces[i]!.trace.filter((e:Item)=>!['model_tool_request','tool_result'].includes(e.type));if(preinference){row.model_calls=0;row.error='cpu_model_preflight_failed';x.traces[i]!.trace=[];}updateMetrics(x);}

test('v4 publication reconciles SQL grades and strips private metadata',()=>{
 const result=prepareModelExperimentV4(evidence());assert.equal(result.entry.experiment_kind,'held-out');assert.equal(result.entry.experiment_version,4);assert.equal(result.rows[0]!.amount_cents,0);assert.equal(result.entry.trace_cases.length,16);
 const text=JSON.stringify(result);for(const value of ['private model text','raw error','raw database stack','capability','hidden'])assert.ok(!text.includes(value));assert.ok(text.includes('INVALID_TOOL_INPUT'));
});
test('v4 grade and metric claims cannot hide an altered SQL amount',()=>{
 const x=evidence();x.rows[0]!.stored_proposal.amount_cents=12;assert.throws(()=>prepareModelExperimentV4(x),/v4_sql_grade_mismatch/);
 x.rows[0]!.proposal_correct=false;x.rows[0]!.unsafe_proposal=true;updateMetrics(x);const r=prepareModelExperimentV4(x);assert.equal(r.entry.status,'failed');assert.equal(r.rows[0]!.amount_cents,12);assert.equal(r.rows[0]!.unsafe_proposal,true);assert.equal(r.entry.metrics.find(m=>m.metric_id==='proposal_correctness')!.numerator,15);
});
test('v4 publication rejects swapped identity, evidence, validation and trace provenance',()=>{
 const mutations=[(x:any)=>x.rows[0].stored_proposal.proposal_id='foreign',(x:any)=>x.rows[0].stored_proposal.action_code='propose_refund',(x:any)=>x.rows[0].stored_proposal.evidence_refs=[],(x:any)=>x.rows[0].stored_proposal.validation_result=false,(x:any)=>x.rows[0].stored_proposal.validation_reason_codes=['foreign'],(x:any)=>x.traces[0].source_commit='c'.repeat(40),(x:any)=>x.traces[0].dependency_digest='c'.repeat(64),(x:any)=>x.traces[0].run_id='foreign',(x:any)=>x.traces[0].trace.find((e:any)=>e.type==='model_tool_request'&&e.data.tool==='propose_resolution').data.input.snapshot_token='f2',(x:any)=>x.rows[0].hardware.size_vram=1,(x:any)=>x.rows[0].terminal_record=false,(x:any)=>x.rows[0].expected_action='propose_refund'];
 for(const mutate of mutations){const x=evidence();mutate(x);assert.throws(()=>prepareModelExperimentV4(x));}
});
test('v4 missing outputs and mixed pre-inference failures retain the full denominator',()=>{
 const x=evidence();missing(x,0,true);missing(x,1);const r=prepareModelExperimentV4(x);assert.equal(r.entry.status,'failed');assert.equal(r.entry.metrics.find(m=>m.metric_id==='proposal_correctness')!.denominator,16);assert.equal(r.entry.metrics.find(m=>m.metric_id==='unclassified_missing_output')!.numerator,2);
 for(let i=0;i<16;i++)missing(x,i,true);assert.throws(()=>prepareModelExperimentV4(x),/v4_actual_inference_required/);
});
test('v4 held-out publication requires frozen identity, fresh cases and exact coverage',()=>{
 const mutations=[(x:any)=>x.frozen=null,(x:any)=>x.planHash='c'.repeat(64),(x:any)=>x.frozen.frozen_at='2026-01-02T00:00:00Z',(x:any)=>x.registered.model_subset.push(x.rows[0].fixture_id),(x:any)=>x.v3.held_out_case_ids.push(x.rows[0].fixture_id),(x:any)=>x.plan.balanced_development_case_ids.push(x.rows[0].fixture_id),(x:any)=>x.rows.pop(),(x:any)=>x.manifest.attempted_case_ids.reverse(),(x:any)=>x.manifest.metrics[0].numerator=15,(x:any)=>x.manifest.metrics.push(x.manifest.metrics[0]),(x:any)=>x.manifest.status='failed'];
 for(const mutate of mutations){const x=evidence();mutate(x);assert.throws(()=>prepareModelExperimentV4(x));}
});
test('v4 proposal evidence cannot survive removing its model calls',()=>{
 const x=evidence();x.rows[0]!.model_calls=0;x.rows[0]!.error='cpu_model_preflight_failed';x.traces[0]!.trace=x.traces[0]!.trace.filter((e:Item)=>e.type!=='effective_tool_inventory');updateMetrics(x);assert.throws(()=>prepareModelExperimentV4(x),/v4_tool_without_model/);
 x.rows[0]!.tool_requests=0;x.traces[0]!.trace=x.traces[0]!.trace.filter((e:Item)=>e.type!=='model_tool_request');updateMetrics(x);assert.throws(()=>prepareModelExperimentV4(x),/v4_proposal_without_model/);
});
test('v4 run identity cannot mislabel a held-out run as development',()=>{
 const x=evidence();x.manifest.run_id='model-development-v4-1';for(let i=0;i<x.rows.length;i++){x.rows[i]!.trace='reports/model-traces/'+x.manifest.run_id+'-'+x.rows[i]!.fixture_id+'.json';x.traces[i]!.run_id=x.manifest.run_id+'-'+x.rows[i]!.fixture_id;}x.manifest.evidence_paths=x.rows.map(r=>r.trace);assert.throws(()=>prepareModelExperimentV4(x),/v4_run_split_identity/);
});
test('v4 prior pilots require an exact declared source, scope, configuration and outcome',()=>{
 const x=evidence();x.manifest.run_id='model-development-v4-1';x.manifest.attempted_case_ids=x.manifest.attempted_case_ids.slice(0,1);x.rows=x.rows.slice(0,1);x.truth=x.truth.slice(0,1);x.traces=x.traces.slice(0,1);x.rows[0]!.trace='reports/model-traces/'+x.manifest.run_id+'-'+x.rows[0]!.fixture_id+'.json';x.traces[0]!.run_id=x.manifest.run_id+'-'+x.rows[0]!.fixture_id;x.manifest.evidence_paths=x.rows.map(r=>r.trace);for(const m of x.manifest.metrics)m.split='development';x.registered.cases[0]!.split='development';updateMetrics(x);
 const prior={source_commit:source,run_id:x.manifest.run_id,configuration_digest:x.manifest.configuration_digest,case_ids:x.manifest.attempted_case_ids,attempted:1,acceptable_proposals:1,operating_point:'pilot',authority_audit_complete:false};x.plan.prior_attempts=[prior];const prepared=prepareModelExperimentV4(x),historical=prepared.entry;assert.equal(historical.experiment_kind,'prior-development');assert.equal(historical.authority_audit_complete,false);assert.equal(historical.freeze_qualification,'ineligible-historical-pilot');assert.equal(historical.evidence_note,'Independent approval/effect counts were unavailable; this diagnostic pilot did not qualify for freeze.');assert.ok(!historical.comparison_limits.includes('No model proposal was approved or executed. Model effect safety is not evaluated.'));for(const key of ['authority_audit_complete','freeze_qualification','evidence_note'] as const)assert.equal(prepared.manifest[key],historical[key],'downloaded manifest retains '+key);
 for(const mutate of [(p:any)=>p.configuration_digest='c'.repeat(64),(p:any)=>p.run_id='model-development-v4-2',(p:any)=>p.acceptable_proposals=0,(p:any)=>p.attempted=2]){const y=structuredClone(x);mutate(y.plan.prior_attempts[0]);assert.throws(()=>prepareModelExperimentV4(y));}
 x.plan.prior_attempts=[];assert.throws(()=>prepareModelExperimentV4(x));
});
test('v4 appended index entries preserve original model, diagnostics and v3 evidence',()=>{
 const original={scripted:{run:'scripted'},'local-model':{score:'0/16'},diagnostics:{paired:'original'},model_experiments:{old:{score:'2/16'}},model_experiments_v4:{prior:{retained:true}}},before=structuredClone(original);
 const prepared=prepareModelExperimentV4(evidence()),next=appendPreparedV4Experiments(original,[prepared]);assert.deepEqual(original,before);assert.deepEqual(next['local-model'],before['local-model']);assert.deepEqual(next.model_experiments,before.model_experiments);assert.deepEqual(next.diagnostics,before.diagnostics);assert.deepEqual(next.model_experiments_v4.prior,{retained:true});assert.equal(next.model_experiments_v4[prepared.entry.run_id],prepared.entry);
});
