import { spawn,execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
if(existsSync('.env'))process.loadEnvFile('.env');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),started_at=new Date().toISOString(),steps=[],children=[];
await mkdir('reports/checks',{recursive:true});
async function run(name,args,options={}){const result=await new Promise(resolve=>{const p=spawn(process.execPath,args,{windowsHide:true,...options});let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.on('error',e=>resolve({code:1,output:e.message}));p.on('exit',code=>resolve({code,output:out}));});await writeFile('reports/checks/'+name+'.txt',result.output);steps.push({name,exit_code:result.code});console.log(name+': '+(result.code===0?'passed':'failed'));if(result.code!==0)throw Error(name+'_failed');}
async function ready(url){for(let i=0;i<40;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('service_not_ready');}
try{
 await run('types',['node_modules/typescript/bin/tsc','-p','tsconfig.json']);await run('agent-types',['node_modules/typescript/bin/tsc','-p','tsconfig.agent.json']);
 await run('agent-v4-types',['node_modules/typescript/bin/tsc','-p','tsconfig.agent-v4.json']);
 await run('site-types',['node_modules/typescript/bin/tsc','-p','apps/site/tsconfig.json']);
 await run('unit',['--test','build/tests/unit/*.test.js']);await run('rederive',['scripts/rederive.mjs']);
 await run('site-build',['../../node_modules/vite/bin/vite.js','build'],{cwd:'apps/site'});
 await run('migrate',['build/scripts/migrate.js']);await run('integration',['--test','--test-concurrency=1','build/tests/integration/*.test.js']);
 const api=spawn(process.execPath,['build/apps/api/server.js'],{windowsHide:true,env:{...process.env,PORT:'18080',HOST:'127.0.0.1',SOURCE_COMMIT:commit,BUILD_TIMESTAMP:started_at,ALLOWED_ORIGINS:'http://127.0.0.1:15173'}});children.push(api);api.stdout.resume();api.stderr.resume();await ready('http://127.0.0.1:18080/ready');
 const site=spawn(process.execPath,['../../node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','15173','--strictPort'],{cwd:'apps/site',windowsHide:true,env:{...process.env,VITE_API_BASE:'http://127.0.0.1:18080'}});children.push(site);site.stdout.resume();site.stderr.resume();await ready('http://127.0.0.1:15173');
 await run('browser',['node_modules/@playwright/test/cli.js','test'],{env:{...process.env,BROWSER_BASE_URL:'http://127.0.0.1:15173'}});
 await run('artifact-scan',['scripts/scan-artifacts.mjs']);
}catch(error){steps.push({name:'verification_error',error:error.message});process.exitCode=1;}
finally{for(const p of children)p.kill();await writeFile('reports/checks/verification.json',JSON.stringify({source_commit:commit,started_at,finished_at:new Date().toISOString(),passed:!process.exitCode,steps,live_deployment_verified:false},null,2)+'\n');}
