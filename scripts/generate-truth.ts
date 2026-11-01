import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { oracle } from '../eval/truth/oracle.js';
import type { Fixture } from '../packages/fixtures/types.js';
const rows=JSON.parse(await readFile('packages/fixtures/data/cases.json','utf8')) as Fixture[];
if(rows.length!==160)throw new Error('incomplete_fixture_set');
await mkdir('eval/truth',{recursive:true});
await writeFile('eval/truth/expected.json',JSON.stringify(rows.map(oracle),null,2)+'\n');
