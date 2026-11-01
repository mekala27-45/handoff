import { z } from 'zod';
const commit=z.string().regex(/^[a-f0-9]{40}$/);
const deployed=z.object({url:z.url().refine(s=>new URL(s).protocol==='https:'),source_commit:commit,verified:z.literal(true)}).strict();
const readiness=z.object({candidate_commit:commit,verification_commit:commit,clean_rederivation_commit:commit,full_suite_passed:z.literal(true),live_api:deployed,pages:deployed,publication_authorized:z.literal(true),gates:z.array(z.object({step:z.number().int().min(1).max(17),done:z.literal(true),evidence:z.string().min(1)}).strict()).length(17)}).strict();
export function releaseReadiness(input:unknown){
 const parsed=readiness.safeParse(input);if(!parsed.success)return {ready:false,reasons:parsed.error.issues.map(i=>i.path.join('.')+': '+i.code)};
 const r=parsed.data,reasons:string[]=[];
 if(new Set(r.gates.map(g=>g.step)).size!==17)reasons.push('missing_or_duplicate_gate');
 if([r.verification_commit,r.clean_rederivation_commit,r.live_api.source_commit,r.pages.source_commit].some(c=>c!==r.candidate_commit))reasons.push('candidate_commit_mismatch');
 return {ready:reasons.length===0,reasons};
}
