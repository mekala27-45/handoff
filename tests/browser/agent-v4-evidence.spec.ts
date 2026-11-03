import { test,expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('v4 recorded evidence is additive and retains original v2 and v3 history',async({page})=>{
 const index=JSON.parse(readFileSync('apps/site/public/reports/index.json','utf8')),original=index['local-model'];
 const originalV3=Object.values(index.model_experiments).find((r:any)=>r.experiment_kind==='held-out') as any;
 expect(original.metrics.find((m:any)=>m.metric_id==='proposal_correctness').numerator).toBe(0);expect(originalV3.metrics.find((m:any)=>m.metric_id==='proposal_correctness').numerator).toBe(2);
 // Browser-only fixture exercises presentation. It is never written to production reports.
 const run={...originalV3,run_id:'model-heldout-v4-browser-fixture',experiment_version:4,title:'Agent v4 recorded UI fixture',model:'qwen3:4b-q4_K_M',source_commit:'b'.repeat(40),configuration_digest:'a'.repeat(64),model_digest:'c'.repeat(64),status:'failed',trace_cases:[{fixture_id:'fx_browser_fixture',entries:[{type:'model_tool_admission',data:{tool_calls:[{tool:'propose_resolution',argument_status:'valid'}]}}]}],filename:'v4-browser-fixture.json',cases_filename:'v4-browser-fixture-cases.json',traces_filename:'v4-browser-fixture-traces.json',changes:['A separately pinned larger CPU model.'],comparison_limits:['Fixture for recorded evidence presentation only.']};
 index.model_experiments_v4={[run.run_id]:run};await page.route('**/reports/index.json',route=>route.fulfill({json:index}));
 await page.goto('/');await page.getByRole('button',{name:'03 Evaluation',exact:true}).click();await page.locator('button[data-mode="local-model"]').click();
 await expect(page.getByRole('heading',{name:'Local Qwen evaluation',exact:true})).toBeVisible();
 const baseline=page.getByRole('table',{name:'Recorded local-model evaluation. Source: '+original.run_id+'.'}).getByRole('row').filter({has:page.getByRole('rowheader',{name:'proposal correctness',exact:true})});await expect(baseline.getByRole('cell').nth(0)).toHaveText('0');await expect(baseline.getByRole('cell').nth(1)).toHaveText('16');
 await expect(page.getByRole('heading',{name:'Agent v3 experiments',exact:true})).toBeVisible();
 const old=page.locator('[data-experiment-run="'+originalV3.run_id+'"]');const oldGrade=old.getByRole('row').filter({has:page.getByRole('rowheader',{name:'proposal correctness',exact:true})});await expect(oldGrade.getByRole('cell').nth(0)).toHaveText('2');await expect(oldGrade.getByRole('cell').nth(1)).toHaveText('16');
 await expect(page.getByRole('heading',{name:'Recovery under failure',exact:true})).toBeVisible();
 const section=page.locator('[data-model-experiment-version="4"]'),entry=section.locator('[data-experiment-v4-run="'+run.run_id+'"]');
 await expect(section.getByRole('heading',{name:'Agent v4 experiments',exact:true})).toBeVisible();await expect(section.getByText('RECORDED ACTUAL CPU INFERENCE',{exact:true})).toBeVisible();
 await expect(entry.getByRole('heading',{name:run.title,exact:true})).toBeVisible();await expect(entry).toContainText('qwen3:4b-q4_K_M');await expect(entry).toContainText(run.configuration_digest);await expect(entry).toContainText('Recorded quality status: failed');
 await expect(entry.getByRole('link',{name:run.source_commit,exact:true})).toHaveAttribute('href','https://github.com/mekala27-45/handoff/tree/'+run.source_commit);
 for(const [label,file] of [['run manifest',run.filename],['case grades',run.cases_filename],['sanitized traces',run.traces_filename]]){const link=entry.getByRole('link',{name:'Download agent v4 '+label,exact:true});await expect(link).toHaveAttribute('href',new RegExp('/reports/'+file.replaceAll('.','\\.')+'$'));await expect(link).toHaveAttribute('download','');}
 await entry.getByText('Inspect agent v4 sanitized tool traces',{exact:true}).click();await expect(entry.locator('.experiment-trace pre')).toContainText('model_tool_admission');
 await expect(section).toContainText('The public workbench runs the scripted workflow. These are recorded model evaluations.');await expect(section).toContainText('do not establish production readiness');
 await page.setViewportSize({width:390,height:844});expect(await entry.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
});

test('missing v4 evidence does not render a score or placeholder result',async({page})=>{
 const index=JSON.parse(readFileSync('apps/site/public/reports/index.json','utf8'));delete index.model_experiments_v4;
 await page.route('**/reports/index.json',route=>route.fulfill({json:index}));await page.goto('/');await page.getByRole('button',{name:'03 Evaluation',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Agent v3 experiments',exact:true})).toBeVisible();await expect(page.locator('[data-model-experiment-version="4"]')).toHaveCount(0);
});
