type Observation={tool:string;result?:unknown};

export function phaseGuidance(observed:readonly Observation[]):string|null {
 if(observed.some(item=>item.tool==='propose_resolution'))return null;
 const facts=observed.filter(item=>item.tool==='get_order_facts').at(-1);
 if(!facts)return 'Next tool: get_order_facts. Use the ticket order ID in a tool call.';
 const result=facts.result as {snapshot_token?:unknown;refused?:unknown;code?:unknown}|undefined;
 const policies=observed.filter(item=>item.tool==='find_policy_clauses');
 if(!policies.some(item=>Array.isArray(item.result)&&item.result.length>0)){
  if(result?.refused===true&&result.code==='identity_or_scope_refused')return 'Next tool: find_policy_clauses. Search for identity or scope policy terms because the facts lookup was refused. Do not try other orders. Use a tool call.';
  return 'Next tool: find_policy_clauses. Choose the policy topic that matches the customer request: damage, delay, cancel before, cancel after, duplicate, window, identity, refunded. Use a tool call.';
 }
 const token=typeof result?.snapshot_token==='string'&&/^[fr][1-6]$/.test(result.snapshot_token)?result.snapshot_token:null;
 return `Next tool: propose_resolution. Required input fields: action_code, cited_clause_ids, snapshot_token, rationale. Choose exactly one action_code: propose_refund, draft_escalation, draft_manual_review, draft_confirmation, request_identity_review. ${token?`Use snapshot_token ${token}. `:''}Choose the action and citations from the policy conditions and observed facts. A reviewed refund means propose_refund, not draft_manual_review. If required evidence is missing, first retrieve window. Submit a tool call; do not print JSON or stop with prose.`;
}
