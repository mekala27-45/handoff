import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { reportSchema,renderClaims } from '../packages/domain/claims.js';
const ids=process.argv.slice(2);if(!ids.length)throw new Error('explicit_run_ids_required');
const index:Record<string,unknown>={};
await mkdir('apps/site/public/reports',{recursive:true});await mkdir('reports/public',{recursive:true});
for(const id of ids){
 if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error('invalid_run_id');
 const r=reportSchema.parse(JSON.parse(await readFile(`reports/runs/${id}.json`,'utf8')));
 execFileSync('git',['cat-file','-e',r.source_commit+'^{commit}']);
 for(const path of r.evidence_paths){if(!path.startsWith('reports/')||!(await readFile(path)).length)throw new Error('missing_evidence');}
 const rows=JSON.parse(await readFile(`reports/runs/${id}-cases.json`,'utf8'));
 if(!Array.isArray(rows)||rows.length!==r.attempted_case_ids.length||new Set(rows.map(x=>x.fixture_id)).size!==rows.length)throw new Error('incomplete_case_table');
 for(const metric of r.metrics){
  const eligible=rows.filter(x=>r.mode==='local-model'||x.split===metric.split);
  const field=({proposal_correctness:'proposal_correct',actual_tool_execution:'actual_tools',valid_required_evidence:'evidence_valid',unsafe_proposed_action:'unsafe_proposal',unclassified_missing_output:'unclassified',safe_terminal_state:'audit'} as Record<string,string>)[metric.metric_id];
  if(!field)throw new Error('unsupported_public_metric');
  const numerator=eligible.filter(x=>field==='actual_tools'?x.tool_requests>0&&x.model_calls>0:field==='audit'?x.audit?.passed:x[field]).length;
  if(numerator!==metric.numerator||eligible.length!==metric.denominator)throw new Error('metric_does_not_match_case_evidence');
 }
 const body=JSON.stringify(r,null,2)+'\n',filename=id+'.json';
 await writeFile('apps/site/public/reports/'+filename,body);await writeFile('reports/public/'+filename,body);
 const trace_cases=[];
 if(r.mode==='local-model')for(const row of rows){
  if(!row.trace?.startsWith('reports/model-traces/'))throw new Error('invalid_trace_path');
  const trace=JSON.parse(await readFile(row.trace,'utf8'));
  if(trace.source_commit!==r.source_commit||trace.configuration_digest!==r.configuration_digest)throw new Error('trace_provenance_mismatch');
  const allowed=['effective_tool_inventory','model_started','model_settled','model_tool_request','tool_result','usage_recorded','eve_result'];
  trace_cases.push({fixture_id:row.fixture_id,run_id:trace.run_id,source_commit:trace.source_commit,proposal_correct:row.proposal_correct,entries:trace.trace.filter((x:any)=>allowed.includes(x.type))});
 }
 if(trace_cases.length)await writeFile('apps/site/public/reports/'+id+'-traces.json',JSON.stringify(trace_cases,null,2)+'\n');
 index[r.mode]={...r,filename,trace_cases,title:r.mode==='scripted'?'Scripted workflow evaluation':'Local Qwen evaluation',summary:renderClaims(r).split('\n\n')[0],query:'Read the immutable per-case records for this run. Count proposal_correct = true; retain all registered attempts in the denominator. Compare aggregate totals to the validated manifest. Source: scripts/publish-reports.ts. Historical source commit is shown below; this is recorded evidence.'};
}
await writeFile('apps/site/public/reports/index.json',JSON.stringify(index,null,2)+'\n');
console.log(JSON.stringify({published_recorded_modes:Object.keys(index)}));
