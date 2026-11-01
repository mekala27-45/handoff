import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),findings=[];
for(const file of tracked){
 if(/(^|\/)(\.env(?!\.example)|\.local|\.eve|node_modules)(\/|$)|\.(gguf|exe|log)$/.test(file))findings.push({file,reason:'private_or_transient_path'});
 const value=await readFile(file,'utf8').catch(()=>'');
 if(/postgres(?:ql)?:\/\/[^\s/"']+:[^\s@"']+@(?!localhost|127\.0\.0\.1)[^\s"']+/i.test(value))findings.push({file,reason:'remote_database_credential'});
 if(/(?:npg_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{24,}|sk-proj-[A-Za-z0-9_-]{20,})/.test(value))findings.push({file,reason:'credential_pattern'});
 if(/"capability"\s*:\s*"[A-Za-z0-9_-]{32,}"/.test(value))findings.push({file,reason:'persisted_session_capability'});
}
async function walk(path){const out=[];for(const e of await readdir(path,{withFileTypes:true})){const p=path+'/'+e.name;out.push(...(e.isDirectory()?await walk(p):[p]));}return out;}
const runtime=[...await walk('build/apps/api'),...await walk('build/packages'),...await walk('apps/site/dist')];
if(!runtime.length)throw Error('empty_runtime_artifacts');
for(const file of runtime){if(/(?:^|\/)(?:truth|agent|skills|\.env|\.local|model-traces)(?:\/|$)/.test(file)||/\.gguf$/.test(file))findings.push({file,reason:'forbidden_runtime_file'});}
const docker=await readFile('Dockerfile.vercel','utf8');if(/^COPY\s+\.\s/m.test(docker))findings.push({file:'Dockerfile.vercel',reason:'unbounded_docker_copy'});
const report={source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checked_at:new Date().toISOString(),source_files:tracked.length,runtime_files:runtime.length,findings,passed:findings.length===0,scope:'Tracked source and explicit site/API artifact trees. Pattern scan, not proof of absence of every secret.'};
await mkdir('reports/checks',{recursive:true});await writeFile('reports/checks/artifact-scan.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(findings.length)process.exitCode=1;
