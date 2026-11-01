import { writeFile,readFile } from 'node:fs/promises';
import { modelConfiguration } from '../eval/harness/model-config.js';
import { digest } from '../packages/domain/canonical.js';
const configuration=await modelConfiguration(),path='eval/plans/model-config-v2.json',existing=await readFile(path,'utf8').catch(()=>null);
if(existing)throw new Error('configuration_already_frozen_create_a_new_evaluation_version');
await writeFile(path,JSON.stringify({frozen_at:new Date().toISOString(),configuration_digest:digest(configuration),configuration},null,2)+'\n');
console.log(JSON.stringify({configuration_digest:digest(configuration)}));
