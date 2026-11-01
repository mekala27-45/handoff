import { readFile,writeFile } from 'node:fs/promises';
import { modelConfiguration } from '../eval/harness/model-experiment-config.js';
import { digest } from '../packages/domain/canonical.js';
import { reportSchema } from '../packages/domain/claims.js';

const path='eval/plans/model-config-v3.json',runId=process.argv[2];
if(!runId||!/^model-development-v3-\d+$/.test(runId))throw new Error('explicit_development_run_required');
if(await readFile(path,'utf8').catch(()=>null))throw new Error('configuration_already_frozen');
const plan=JSON.parse(await readFile('eval/plans/model-experiment-v3.json','utf8'));
const report=reportSchema.parse(JSON.parse(await readFile(`reports/runs/${runId}.json`,'utf8')));
const rows=JSON.parse(await readFile(`reports/runs/${runId}-cases.json`,'utf8'));
const configuration=await modelConfiguration(),configuration_digest=digest(configuration);
if(report.mode!=='local-model'||report.configuration_digest!==configuration_digest)throw new Error('development_configuration_mismatch');
if(JSON.stringify([...report.attempted_case_ids].sort())!==JSON.stringify([...plan.development_case_ids].sort())||JSON.stringify(rows.map((r:any)=>r.fixture_id).sort())!==JSON.stringify([...plan.development_case_ids].sort()))throw new Error('incomplete_development_scope');
const metric=report.metrics.find(m=>m.metric_id==='proposal_correctness');
if(!metric||metric.split!=='development'||metric.numerator!==rows.filter((r:any)=>r.proposal_correct).length||metric.denominator!==rows.length)throw new Error('development_metric_mismatch');
if(rows.some((r:any)=>!r.terminal_record)||!rows.some((r:any)=>r.proposal_correct))throw new Error('no_demonstrated_development_improvement');
await writeFile(path,JSON.stringify({frozen_at:new Date().toISOString(),development_run_id:runId,development_source_commit:report.source_commit,configuration_digest,configuration},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({configuration_digest,development_run_id:runId,correct:rows.filter((r:any)=>r.proposal_correct).length,attempted:rows.length}));
