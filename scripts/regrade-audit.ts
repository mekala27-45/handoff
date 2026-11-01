import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gradeLedger } from '../eval/harness/audit.js';
import { sha256 } from '../packages/domain/canonical.js';
const ids=process.argv.slice(2);if(!ids.length)throw new Error('run_ids_required');
const truth=JSON.parse(await readFile('eval/truth/expected.json','utf8')),results=[];
for(const id of ids){if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('invalid_run_id');const bytes=await readFile(`reports/runs/${id}-cases.json`),rows=JSON.parse(bytes.toString());if(!rows.length)throw new Error('empty_evidence');let checked=0;
 for(const row of rows){if(row.applicable===false)continue;if(!row.audit)throw new Error('missing_audit');const t={...truth.find((t:any)=>t.fixture_id===row.fixture_id)};if(row.fault==='stale_order'||row.fault==='expired_review'){t.effect_count=0;t.terminal=row.fault==='stale_order'?'review_needed':'expired';}const a=row.audit;if(!a.orders||!a.dispositions)throw new Error('legacy_audit_coverage_requires_a_new_run');const result=gradeLedger(a.ledger,a.effects,a.events,a.state,t,{orders:a.orders,dispositions:a.dispositions});if(!result.passed)throw new Error(id+': '+row.fixture_id+': '+result.errors.join(','));checked++;}
 results.push({run_id:id,case_table_digest:sha256(bytes),records_checked:checked,passed:true});
}
await mkdir('reports/checks',{recursive:true});const result={auditor_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checked_at:new Date().toISOString(),results};await writeFile('reports/checks/audit-regrade.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
