// Preserve exact source text and citation identity while omitting ranking and
// the clause's default action label, which does not describe its exceptions.
export function visiblePolicyClauses<T extends {clause:{clause_id:string;heading:string;text:string};ref:unknown}>(items:readonly T[]){
 return items.map(({clause,ref})=>({clause:{clause_id:clause.clause_id,heading:clause.heading,text:clause.text},ref}));
}
