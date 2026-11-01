import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { digest,sha256 } from '../../packages/domain/canonical.js';
import { reportSchema,renderClaims } from '../../packages/domain/claims.js';
export const sourceCommit=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
export async function provenance(mode:'scripted'|'local-model',configuration:unknown){
 const plan=JSON.parse(await readFile('eval/plans/registered.json','utf8'));
 return {mode,source_commit:sourceCommit(),dependency_digest:sha256(await readFile('package-lock.json')),dataset_digest:plan.dataset_digest,policy_digest:plan.policy_digest,configuration_digest:digest(configuration),model_digest:mode==='local-model'?JSON.parse(await readFile('docs/sources/model-lock.json','utf8')).model.digest:null};
}
export async function saveReport(report:unknown,rows:unknown){const r=reportSchema.parse(report);await mkdir('reports/runs',{recursive:true});await writeFile(`reports/runs/${r.run_id}.json`,JSON.stringify(r,null,2)+'\n');await writeFile(`reports/runs/${r.run_id}-cases.json`,JSON.stringify(rows,null,2)+'\n');await writeFile(`reports/runs/${r.run_id}.txt`,renderClaims(r)+'\n');}
