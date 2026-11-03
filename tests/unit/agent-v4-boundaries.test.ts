import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join,resolve } from 'node:path';
import { parseV4ModelLock,parseV4Scope,validateV4ModelEndpoint,validateV4ModelRequest,v4RepositoryRoot,V4_TOOLS } from '../../agent-v4/agent/lib/configuration.js';

const lock={ollama_version:'0.40.13',model:{name:'qwen3:4b-q4_K_M',digest:'a'.repeat(64)}};

test('v4 model selection fails closed on missing, unknown or unpinned public metadata',()=>{
 assert.deepEqual(parseV4ModelLock({...lock,private_field:'not copied'}),lock);
 for(const bad of [null,{}, {...lock,ollama_version:'other'}, {...lock,model:{...lock.model,digest:'short'}}, {...lock,model:{...lock.model,name:'hosted-provider/model'}}, {...lock,model:{...lock.model,name:'qwen3:0.6b'}}])assert.throws(()=>parseV4ModelLock(bad));
 assert.equal(parseV4ModelLock({...lock,model:{...lock.model,name:'qwen3:1.7b-q4_K_M'}}).model.name,'qwen3:1.7b-q4_K_M');
});

test('v4 project explicitly binds its repository and cannot select the legacy scope',()=>{
 const root=resolve(process.cwd()),project=join(root,'agent-v4');
 assert.equal(v4RepositoryRoot(project,root,'v4'),root);
 assert.throws(()=>v4RepositoryRoot(project,root,'v3'),/v4_runtime_environment_required/);
 assert.throws(()=>v4RepositoryRoot(project,'relative-root','v4'),/v4_runtime_environment_required/);
 assert.throws(()=>v4RepositoryRoot(root,root,'v4'),/v4_project_directory_required/);
 assert.throws(()=>v4RepositoryRoot(join(root,'other-project'),root,'v4'),/v4_project_directory_required/);
});

test('v4 scope refuses cross-version and path-shaped run identifiers',()=>{
 const value={run_id:'model-development-v4-1793720000000-fx_0123456789abcdefabcd',case_id:'case_synthetic-unit',order_id:'SYN-ORDER-unit',capability:'C'.repeat(43),started_at:1793720000000};
 assert.deepEqual(parseV4Scope({...value,unused:'not copied'}),value);
 for(const patch of [{run_id:'../../private'},{run_id:value.run_id.replace('-v4-','-v3-')},{case_id:'../outside'},{capability:''},{started_at:0},{started_at:NaN}])assert.throws(()=>parseV4Scope({...value,...patch}),/v4_scope_invalid/);
});

test('v4 transport permits only the pinned model and the original three local tools',()=>{
 const name='qwen3:4b-q4_K_M',tools=V4_TOOLS.map(name=>({function:{name}}));
 assert.deepEqual(validateV4ModelRequest({model:name,tools},name),[...V4_TOOLS]);
 assert.throws(()=>validateV4ModelRequest({model:'qwen3:0.6b',tools},name),/v4_model_selection_mismatch/);
 assert.throws(()=>validateV4ModelRequest({model:name,tools:[...tools,{function:{name:'approve_resolution'}}]},name),/tool_inventory_mismatch/);
 assert.throws(()=>validateV4ModelRequest({model:name,tools:tools.slice(1)},name),/tool_inventory_mismatch/);
 validateV4ModelEndpoint('http://127.0.0.1:11435/v1/chat/completions');
 for(const url of ['https://127.0.0.1:11435/v1/chat/completions','http://127.0.0.1:11435.evil.example/','http://user:private@127.0.0.1:11435/v1/chat/completions','https://example.com/v1/chat/completions'])assert.throws(()=>validateV4ModelEndpoint(url));
});
