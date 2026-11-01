import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const files=['packages/fixtures/data/cases.json','packages/fixtures/data/policy.json','eval/plans/registered.json','eval/plans/registered.sha256','eval/truth/expected.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const before=await hashes(),runs=[];
for(const seed of ['17','991']){for(const generator of ['generate-fixtures','generate-truth'])execFileSync(process.execPath,['build/scripts/'+generator+'.js'],{env:{...process.env,PYTHONHASHSEED:seed},stdio:'pipe'});runs.push({PYTHONHASHSEED:seed,files:await hashes()});}
if(runs.some(r=>JSON.stringify(r.files)!==JSON.stringify(before)))throw Error('deterministic_rederivation_mismatch');
const result={source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),passed:true,runs,scope:'TypeScript fixture, independent truth and registered-plan bytes. Python hash seeding has no effect on these Node generators. UUIDs, timings, wall clocks, model outputs and database receipts are intentionally not byte deterministic.'};
await mkdir('reports/checks',{recursive:true});await writeFile('reports/checks/rederivation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,files:files.length,seeds:runs.map(r=>r.PYTHONHASHSEED)}));
