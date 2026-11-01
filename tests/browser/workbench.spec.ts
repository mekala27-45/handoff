import { test,expect } from '@playwright/test';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
async function start(page:any){await page.goto('/');await expect(page.getByText('API connected',{exact:true})).toBeVisible();const response=page.waitForResponse((r:any)=>r.url().endsWith('/demo/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Start synthetic case'}).click();const session=await(await response).json();await page.getByRole('button',{name:'Begin evidence review'}).click();await page.getByRole('button',{name:'Generate scripted proposal'}).click();await expect(page.getByRole('button',{name:'Review and approve'})).toBeVisible();return session;}
test('review dialog, response discard, recovery and duplicate execution',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await start(page);
 await page.getByRole('button',{name:'Review and approve'}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Review and approve'})).toBeFocused();
 await page.getByRole('button',{name:'Review and approve'}).click();await page.getByRole('button',{name:'Approve simulated resolution',exact:true}).click();
 await page.getByLabel('Discard response once').check();await page.getByRole('button',{name:'Execute simulated action'}).click();
 await expect(page.getByRole('status')).toContainText('Response intentionally discarded');await page.getByRole('button',{name:'Recover operation receipt'}).click();
 await expect(page.getByRole('heading',{name:'The receipt',exact:true})).toBeVisible();await page.getByRole('button',{name:'Repeat execution request'}).click();
 await expect(page.getByRole('status')).toContainText('existing result');expect(errors).toEqual([]);
 await page.screenshot({path:'.local/workbench-receipt.png',fullPage:true});
});
test('rejection, explicit revision and empty filters are honest',async({page})=>{
 await start(page);await page.getByRole('button',{name:'Reject proposal',exact:true}).click();await expect(page.getByRole('button',{name:'Execute simulated action'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Request a new proposal'})).toBeVisible();
 await page.locator('nav button[data-page="cases"]').click();await page.getByLabel('Filter by state').selectOption('completed');await expect(page.getByText('No cases match these filters')).toBeVisible();await page.getByRole('button',{name:'Reset filters'}).click();await expect(page.getByRole('button',{name:/Open damage case/})).toBeVisible();
});
test('unavailable API cannot display a fake live table',async({page})=>{
 await page.route('**/ready',route=>route.abort());await page.goto('/');await expect(page.getByText('The API is unavailable',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Start synthetic case'})).toBeDisabled();await expect(page.locator('tbody tr')).toHaveCount(0);
});
test('evaluation modes and missing manifests stay separate',async({page})=>{
 await page.route('**/reports/index.json',route=>route.fulfill({json:{}}));await page.goto('/');await page.getByRole('button',{name:'03 Evaluation',exact:true}).click();await page.getByRole('button',{name:'■ Local model'}).click();await expect(page.getByRole('heading',{name:'Not evaluated',exact:true})).toBeVisible();await expect(page.getByText('Missing evidence does not mean zero failures.')).toBeVisible();await expect(page.getByText('RECORDED RUNS',{exact:true})).toBeVisible();
});
test('recorded model evidence shows its real denominator and inspectable trace',async({page})=>{
 const index=JSON.parse(readFileSync('apps/site/public/reports/index.json','utf8')),recorded=index['local-model'];
 expect(recorded.attempted_case_ids.length).toBe(16);
 await page.goto('/');await page.getByRole('button',{name:'03 Evaluation',exact:true}).click();await page.locator('button[data-mode="local-model"]').click();
 await expect(page.getByRole('heading',{name:'Local Qwen evaluation',exact:true})).toBeVisible();await expect(page.getByText('RECORDED LOCAL-MODEL',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Recorded case').locator('option')).toHaveCount(16);await page.getByLabel('Recorded case').selectOption('14');
 await page.getByText('Inspect actual calls and results',{exact:true}).click();await expect(page.locator('.recorded-trace pre')).toContainText(recorded.trace_cases[14].fixture_id);await expect(page.locator('.recorded-trace pre')).toContainText('effective_tool_inventory');
 await expect(page.getByRole('link',{name:'Download run manifest'})).toHaveAttribute('href',new RegExp(recorded.run_id));
 await expect(page.getByRole('heading',{name:'Recovery under failure',exact:true})).toBeVisible();
 await page.getByText('Compare the same sixteen cases',{exact:true}).click();
 await expect(page.getByRole('table',{name:'Paired dispositions. Missing output remains a model failure.'}).locator('tbody tr')).toHaveCount(16);
 expect(index.diagnostics.faults.reduce((n:number,f:any)=>n+f.passed,0)).toBe(590);
 expect(index.diagnostics.faults.reduce((n:number,f:any)=>n+f.not_applicable,0)).toBe(50);
 await page.screenshot({path:'.local/workbench-evaluation.png',fullPage:true});
});
test('mobile, dark theme, reduced motion and zoom retain readable controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.getByRole('heading',{name:'The dispatch board.'})).toBeVisible();await page.getByRole('button',{name:'Dark theme',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'.local/workbench-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1080});await page.evaluate(()=>document.documentElement.style.zoom='2');await expect(page.getByRole('button',{name:'Start synthetic case'})).toBeVisible();await page.getByRole('button',{name:'04 Methods',exact:true}).click();await expect(page.getByRole('heading',{name:'A narrow, testable promise.'})).toBeVisible();
});
for(const fault of ['expired','stale'])test(`review screen explains ${fault} authority without an effect`,async({page})=>{
 const session=await start(page),pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
 try{
  if(fault==='stale')await pool.query('UPDATE handoff.orders SET revision=revision+1 WHERE session_id=$1',[session.session_id]);
  await page.getByRole('button',{name:'Review and approve'}).click();await page.getByRole('button',{name:'Approve simulated resolution',exact:true}).click();
  if(fault==='expired'){
   await expect(page.getByRole('button',{name:'Execute simulated action'})).toBeVisible();
   await pool.query("UPDATE handoff.reviews SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[session.session_id]);await page.getByRole('button',{name:'Execute simulated action'}).click();
  }
  await expect(page.getByRole('alert')).toContainText(fault==='expired'?'review expired':'stale proposal');await expect(page.getByRole('button',{name:'Request a new proposal'})).toBeVisible();
  expect((await pool.query('SELECT count(*)::int n FROM handoff.effects WHERE session_id=$1',[session.session_id])).rows[0].n).toBe(0);
 }finally{await pool.end();}
});
