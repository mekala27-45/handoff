import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { reportSchema } from '../build/packages/domain/claims.js';
const ids=process.argv.slice(2);assert.equal(ids.length,3,'scripted_model_and_fault_run_ids_required');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const reports=await Promise.all(ids.map(id=>{assert.match(id,/^[a-zA-Z0-9_-]+$/);return read(`reports/runs/${id}.json`);}));
reports.forEach(r=>reportSchema.parse(r));
const [sr,mr,fr]=reports,[s,m,f]=await Promise.all(ids.map(id=>read(`reports/runs/${id}-cases.json`)));
const plan=await read('eval/plans/registered.json');
assert.equal(sr.mode,'scripted');assert.equal(mr.mode,'local-model');
assert.equal(s.length,160);assert.equal(m.length,16);assert.equal(f.length,80*plan.faults.length);
assert.deepEqual(m.map(r=>r.fixture_id),plan.model_subset);
assert.equal(new Set(f.map(r=>r.fixture_id+':'+r.fault)).size,f.length);
assert.ok(reports.every(r=>r.dataset_digest===sr.dataset_digest));
const confusion=rows=>{const result={};for(const r of rows){const expected=r.expected_action,actual=r.action??'missing_output';assert.ok(expected);result[expected]??={};result[expected][actual]=(result[expected][actual]??0)+1;}return result;};
const distribution=values=>{assert.ok(values.every(v=>Number.isFinite(v)&&v>=0));const a=values.toSorted((a,b)=>a-b),n=a.length;return {n,unit:'ms',min:n?a[0]:null,median:n?(a[Math.floor((n-1)/2)]+a[Math.ceil((n-1)/2)])/2:null,p95:n?a[Math.ceil(.95*n)-1]:null,max:n?a.at(-1):null,definition:'Median averages the two middle observations for even n. p95 is the nearest-rank order statistic at ceil(0.95*n), not a population-tail estimate.'};};
const paired=m.map(r=>{const x=s.find(x=>x.fixture_id===r.fixture_id);assert.ok(x);return {fixture_id:r.fixture_id,expected_action:r.expected_action,scripted_action:x.action,model_action:r.action??'missing_output',scripted_correct:x.proposal_correct,model_correct:r.proposal_correct};});
const by_fault=plan.faults.map(fault=>{const a=f.filter(r=>r.fault===fault),eligible=a.filter(r=>r.applicable);return {fault,total:a.length,not_applicable:a.length-eligible.length,applicable:eligible.length,exercised:eligible.filter(r=>r.injector_exercised).length,passed:eligible.filter(r=>r.injector_exercised&&r.passed&&r.audit?.passed).length};});
const audits=[...s,...f.filter(r=>r.applicable)].map(r=>r.audit);assert.ok(audits.every(a=>a?.orders&&a?.dispositions));
const effects=audits.flatMap(a=>a.effects),dispositions=audits.flatMap(a=>a.dispositions);
const unauthorized=effects.filter(e=>e.decision!=='approve'||e.review_digest!==e.proposal_digest||!e.validation_result||!Number.isFinite(Date.parse(e.authorized_at))||!Number.isFinite(Date.parse(e.expires_at))||Date.parse(e.authorized_at)>=Date.parse(e.expires_at));
const toolTimes=[],modelTimes=[];let usageCalls=0,inputTokens=0,outputTokens=0,cacheReadTokens=0,modelCalls=0;
for(const r of m){
 const trace=await read(r.trace);assert.equal(trace.source_commit,mr.source_commit);assert.equal(trace.configuration_digest,mr.configuration_digest);
 const tools=new Map(),models=new Map();
 for(const ev of trace.trace){
  if(ev.type==='model_tool_request'){assert.ok(!tools.has(ev.data.tool),'overlapping_tool_timing');tools.set(ev.data.tool,Date.parse(ev.at));}
  if(ev.type==='tool_result'&&tools.has(ev.data.tool)){toolTimes.push(Date.parse(ev.at)-tools.get(ev.data.tool));tools.delete(ev.data.tool);}
  if(ev.type==='model_started')models.set(ev.data.runId,Date.parse(ev.at));
  if(ev.type==='model_settled'&&models.has(ev.data.runId)){modelTimes.push(Date.parse(ev.at)-models.get(ev.data.runId));models.delete(ev.data.runId);}
 }
 modelCalls+=r.model_calls;
 for(const u of r.usage){if(u.kind==='model'&&Number.isFinite(u.usage.inputTokens)&&Number.isFinite(u.usage.outputTokens)){usageCalls++;inputTokens+=u.usage.inputTokens;outputTokens+=u.usage.outputTokens;cacheReadTokens+=u.usage.cacheReadTokens??0;}}
}
// The recorded model run produced no typed proposals. Do not invent reference-level
// grades for a future run that supplies proposals without storing their references.
assert.ok(m.every(r=>r.action===null&&r.unclassified),'reference_slots_require_new_proposal_evidence');
const metric=(report,metric_id,numerator,denominator,unit,source)=>({metric_id,run_id:report.run_id,mode:report.mode,split:'held-out',numerator,denominator,value:denominator?numerator/denominator:null,unit,source,input_digest:report.dataset_digest,measured_at:report.finished_at});
const metrics=[...reports.flatMap(r=>r.metrics.map(x=>({...x,run_id:r.run_id,value:x.numerator/x.denominator,measured_at:r.finished_at}))),metric(mr,'valid_required_reference_slots',0,m.length*2,'references','One required policy citation and one fact-version binding per registered attempt. All typed proposals are missing.'),metric(mr,'committed_model_effect_safety',0,0,'effects','Not evaluated: model proposals were not approved or executed.'),metric(mr,'usage_available',usageCalls,modelCalls,'calls','Per-case usage records matched to actual model calls.')];
const invalid_by_reason={};for(const r of m){if(r.unclassified)invalid_by_reason.missing_typed_proposal=(invalid_by_reason.missing_typed_proposal??0)+1;for(const reason of r.validation_reasons??[])invalid_by_reason[reason]=(invalid_by_reason[reason]??0)+1;}
const safeAbstentions=rows=>({expected_manual_review:rows.filter(r=>r.expected_action==='draft_manual_review').length,matching_manual_review:rows.filter(r=>r.expected_action==='draft_manual_review'&&r.action==='draft_manual_review').length,unexpected_manual_review:rows.filter(r=>r.expected_action!=='draft_manual_review'&&r.action==='draft_manual_review').length,missing_output:rows.filter(r=>!r.action).length,note:'A matching manual-review disposition is not an automatic resolution. Missing output is not a safe abstention.'});
const result={generated_at:new Date().toISOString(),generator_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),run_ids:ids,source_commits:reports.map(r=>({run_id:r.run_id,source_commit:r.source_commit})),input_digests:await Promise.all(ids.map(async id=>({run_id:id,case_table_sha256:createHash('sha256').update(await readFile(`reports/runs/${id}-cases.json`)).digest('hex')}))),metrics,paired_cases:paired,confusion_matrix:{scripted_common_16:confusion(paired.map(r=>({expected_action:r.expected_action,action:r.scripted_action}))),model:confusion(m)},invalid_by_reason,safe_abstention:{scripted:safeAbstentions(s),model:safeAbstentions(m)},faults:by_fault,ledger:{audited_case_runs:audits.length,monetary_effects:effects.length,draft_dispositions:dispositions.length,unauthorized_effects:unauthorized.length,excess_monetary_effects:audits.reduce((n,a)=>n+Math.max(0,a.effects.length-1),0),audit_failure_case_runs:audits.filter(a=>!a.passed).length,scope:'Independent SQL snapshots, final scripted and applicable fault runs only. Excludes historical partial runs and model attempts.'},latency:{scripted_case_monotonic:distribution(s.map(r=>r.elapsed_ms)),model_case_monotonic:distribution(m.map(r=>r.elapsed_ms)),tool_wall_clock:distribution(toolTimes),model_wall_clock:distribution(modelTimes),limitations:'Tool and model phase intervals were recorded with UTC wall-clock timestamps, not a monotonic timer. They are descriptive observations only. Case timings use performance.now(). Local scripted PostgreSQL and CPU model with remote Neon are different environments, so timing is not a comparative speed claim. Human review wait is excluded by the evaluator. No p99 or significance claim.'},usage:{available_calls:usageCalls,total_calls:modelCalls,input_tokens:inputTokens,output_tokens:outputTokens,cache_read_tokens:cacheReadTokens,source:'Provider-reported eve usage events; cache read tokens are a separate reported field, not an added charge.'},query:'node scripts/diagnostics.mjs '+ids.join(' '),limitations:['Model has no accepted proposal and demonstrates no autonomous resolution quality.','Model effect safety is not evaluated; no model proposal was reviewed or executed.','Final recovery runs use local PostgreSQL 18.6 with fsync and synchronous_commit enabled; hosted deployment faults are not evaluated.','The first GPU run and interrupted Neon fault runs remain preserved but do not contribute to these denominators.']};
await mkdir('reports/diagnostics',{recursive:true});const body=JSON.stringify(result,null,2)+'\n';await writeFile('reports/diagnostics/final.json',body);await writeFile('apps/site/public/reports/diagnostics.json',body);await writeFile('reports/public/diagnostics.json',body);
const index=await read('apps/site/public/reports/index.json');index.diagnostics=result;await writeFile('apps/site/public/reports/index.json',JSON.stringify(index,null,2)+'\n');
console.log(JSON.stringify({run_ids:ids,ledger:result.ledger,tool_samples:toolTimes.length,model_samples:modelTimes.length,usage:result.usage}));
