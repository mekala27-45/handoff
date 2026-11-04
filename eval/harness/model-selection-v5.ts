import assert from 'node:assert/strict';
import { sha256 } from '../../packages/domain/canonical.js';
type Registered={cases:{fixture_id:string;family:string;split:string}[];model_subset:string[]};
export function selectV5Cases(registered:Registered,excluded:readonly string[],split:'development'|'held-out',perFamily:number,seed:string){
 const families=[...new Set(registered.cases.map(c=>c.family))].sort();
 return families.flatMap(family=>registered.cases.filter(c=>c.split===split&&c.family===family&&!excluded.includes(c.fixture_id)).sort((a,b)=>{
  const key=(id:string)=>sha256([seed,split,family,id].join('\0'));
  return key(a.fixture_id).localeCompare(key(b.fixture_id))||a.fixture_id.localeCompare(b.fixture_id);
 }).slice(0,perFamily).map(c=>c.fixture_id)).sort();
}
export function verifyV5Selection(plan:any,registered:Registered,v3:any,v4:any){
 const excluded=[...registered.model_subset,...v3.held_out_case_ids,...v4.held_out_case_ids].sort();
 assert.equal(new Set(excluded).size,48,'prior_model_sets_must_be_disjoint');
 assert.deepEqual(plan.excluded_model_case_ids,excluded,'all_prior_model_cases_excluded');
 assert.equal(plan.selection_seed,'handoff-v5-balanced-v1');
 for(const [split,n,key] of [['development',4,'development_case_ids'],['held-out',2,'held_out_case_ids']] as const){
  const expected=selectV5Cases(registered,excluded,split,n,plan.selection_seed);
  assert.equal(expected.length,8*n,'balanced_scope_required');assert.deepEqual(plan[key],expected,'metadata_only_scope_required');
 }
 assert.deepEqual(plan.balanced_development_case_ids,plan.development_case_ids);
 assert.equal(plan.held_out_ids_digest,sha256(JSON.stringify(plan.held_out_case_ids)));
}
