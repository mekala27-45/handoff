import { createHash } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
const repository='mekala27-45/handoff',branch='model-lock-evidence-v4';
if(process.env.GITHUB_REPOSITORY!==repository||process.env.GITHUB_REF!=='refs/heads/agent-quality-v4')throw Error('probe_scope_required');
const source=process.env.GITHUB_SHA,run=process.env.GITHUB_RUN_ID;
if(!/^[a-f0-9]{40}$/.test(source??'')||!/^\d+$/.test(run??''))throw Error('probe_identity_required');
const candidates=[];
for(const tag of ['1.7b-q4_K_M','4b-q4_K_M']){
 const url='https://registry.ollama.ai/v2/library/qwen3/manifests/'+tag;
 const response=await fetch(url,{headers:{Accept:'application/vnd.docker.distribution.manifest.v2+json'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('official_manifest_http_'+response.status);
 const bytes=Buffer.from(await response.arrayBuffer()),digest=createHash('sha256').update(bytes).digest('hex'),header=response.headers.get('docker-content-digest');
 if(header&&header!=='sha256:'+digest)throw Error('official_manifest_digest_mismatch');
 const manifest=JSON.parse(bytes.toString('utf8'));
 if(manifest.schemaVersion!==2||!Array.isArray(manifest.layers))throw Error('official_manifest_schema');
 for(const layer of [manifest.config,...manifest.layers])if(!layer||!/^sha256:[a-f0-9]{64}$/.test(layer.digest)||!Number.isSafeInteger(layer.size)||layer.size<0)throw Error('official_manifest_layer');
 candidates.push({model:'qwen3:'+tag,source_url:url,manifest_digest:digest,docker_content_digest:header,manifest_base64:bytes.toString('base64'),download_bytes:manifest.layers.reduce((n,l)=>n+l.size,0)+manifest.config.size,layers:manifest.layers.map(l=>({media_type:l.mediaType,digest:l.digest,size:l.size})),config:manifest.config});
}
const report={schema_version:1,source_commit:source,workflow_run_id:run,observed_at:new Date().toISOString(),purpose:'Read-only official model manifest capture; no model inference or quality result.',candidates};
const content=JSON.stringify(report,null,2)+'\n';
if(process.env.GH_TOKEN&&content.includes(process.env.GH_TOKEN))throw Error('private_value_in_probe');
await mkdir('reports/checks',{recursive:true});await writeFile('reports/checks/model-candidates-v4.json',content);
async function api(endpoint,method='GET',body,optional=false){const r=await fetch('https://api.github.com/repos/'+repository+'/'+endpoint,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});if(optional&&r.status===404)return null;if(!r.ok)throw Error('probe_publication_http_'+r.status);return r.json();}
const ref=await api('git/ref/heads/'+branch,'GET',undefined,true);let base;
if(ref){const c=await api('git/commits/'+ref.object.sha);base=c.tree.sha;const t=await api('git/trees/'+base+'?recursive=1');if(t.truncated||t.tree.some(e=>e.path!=='README.md'&&!/^probes(?:\/\d+(?:\/model-candidates\.json)?)?$/.test(e.path)))throw Error('probe_branch_scope');}
const tree=await api('git/trees','POST',{...(base?{base_tree:base}:{}),tree:[{path:'README.md',mode:'100644',type:'blob',content:'# Handoff v4 official model locks\n\nRead-only official registry manifests with byte hashes. No inference, private data or quality score.\n'},{path:'probes/'+run+'/model-candidates.json',mode:'100644',type:'blob',content}]});
const commit=await api('git/commits','POST',{message:'Capture official CPU model candidate manifests '+run,tree:tree.sha,parents:ref?[ref.object.sha]:[]});
if(ref)await api('git/refs/heads/'+branch,'PATCH',{sha:commit.sha,force:false});else await api('git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});
console.log(JSON.stringify({workflow_run_id:run,source_commit:source,evidence_branch:branch,evidence_commit:commit.sha,candidates:candidates.map(c=>({model:c.model,digest:c.manifest_digest,download_bytes:c.download_bytes}))}));
