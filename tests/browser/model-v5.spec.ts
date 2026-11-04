import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('v5 evidence is additive, honest about missing records and downloadable',async({page})=>{
 const index=JSON.parse(readFileSync('apps/site/public/reports/index.json','utf8')),runs=Object.values(index.model_experiments_v5??{}) as any[];
 await page.goto('/');await page.locator('button[data-page="evaluation"]').click();await page.locator('button[data-mode="local-model"]').click();
 await expect(page.locator('[data-model-experiment-version="4"]')).toBeVisible();
 const section=page.locator('[data-model-experiment-version="5"]');
 if(!runs.length){await expect(section).toHaveCount(0);return;}
 await expect(section).toBeVisible();await expect(section).toContainText('scores are not paired comparisons');
 for(const prior of runs[0].prior_attempts??[]){const note=section.locator('[data-v5-prior-attempt="'+prior.run_id+'"]');await expect(note).toContainText(prior.correct+'/'+prior.attempted);await expect(note).toContainText('did not qualify for freeze');await expect(note.getByRole('link')).toHaveAttribute('href',prior.evidence_url);}
 for(const run of runs){
  const article=section.locator('[data-experiment-v5-run="'+run.run_id+'"]');await expect(article).toContainText(run.configuration_digest);await expect(article).toContainText(run.source_commit);
  const quality=run.metrics.find((m:any)=>m.metric_id==='proposal_correctness'),row=article.locator('tbody tr').filter({hasText:/proposal correctness/i});
  await expect(row.locator('td').nth(0)).toHaveText(String(quality.numerator));await expect(row.locator('td').nth(1)).toHaveText(String(quality.denominator));
  for(const [name,file] of [['manifest',run.filename],['case grades',run.cases_filename],['sanitized traces',run.traces_filename]]){
   const link=article.getByRole('link',{name:'Download agent v5 '+(name==='manifest'?'run manifest':name),exact:true});await expect(link).toHaveAttribute('href',new RegExp(file.replaceAll('.','\\.')));
   const response=await page.request.get((await link.getAttribute('href'))!);expect(response.ok()).toBe(true);expect(await response.json()).toEqual(JSON.parse(readFileSync('apps/site/public/reports/'+file,'utf8')));
  }
 }
});
