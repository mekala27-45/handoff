import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('declared dependency versions are exact and agree with the immutable installation lock',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8')),lock=JSON.parse(readFileSync('package-lock.json','utf8'));
 const dependencies=Object.entries({...pkg.dependencies,...pkg.devDependencies});assert.ok(dependencies.length>0);
 for(const [name,version] of dependencies){assert.match(String(version),/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/);assert.equal(lock.packages['node_modules/'+name].version,version);}
});
