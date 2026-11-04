// The policy action label is source data and must be read with its conditions.
// Omit ranking metadata while preserving the exact text, action and citation.
export function visiblePolicyClauses<T extends {clause:{clause_id:string;heading:string;text:string;action:string};ref:unknown}>(items:readonly T[]){
 return items.map(({clause,ref})=>({clause:{clause_id:clause.clause_id,heading:clause.heading,text:clause.text,action:clause.action},ref}));
}
