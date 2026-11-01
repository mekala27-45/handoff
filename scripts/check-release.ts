import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { releaseReadiness } from '../packages/domain/release.js';
const evidence=JSON.parse(await readFile(process.argv[2]??'docs/release-candidate.json','utf8')),result=releaseReadiness(evidence);
await mkdir('reports/checks',{recursive:true});await writeFile('reports/checks/release-readiness.json',JSON.stringify({...result,checked_at:new Date().toISOString(),candidate_commit:evidence.candidate_commit},null,2)+'\n');
console.log(JSON.stringify(result));if(!result.ready)process.exitCode=1;
