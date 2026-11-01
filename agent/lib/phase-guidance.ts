type Observation={tool:string;result?:unknown};

export function phaseGuidance(observed:readonly Observation[]):string|null {
 if(observed.some(item=>item.tool==='propose_resolution'))return null;
 const facts=observed.filter(item=>item.tool==='get_order_facts').at(-1);
 if(!facts)return 'Next tool: get_order_facts. Use the ticket order ID in a tool call.';
 const policies=observed.filter(item=>item.tool==='find_policy_clauses');
 if(!policies.some(item=>Array.isArray(item.result)&&item.result.length>0))return 'Next tool: find_policy_clauses. Choose a concise query from the ticket and observed facts. Use a tool call.';
 const result=facts.result as {snapshot_token?:unknown}|undefined;
 const token=typeof result?.snapshot_token==='string'&&/^[fr][1-6]$/.test(result.snapshot_token)?result.snapshot_token:null;
 return `Next tool: propose_resolution. ${token?`Use snapshot_token ${token}. `:''}Choose the action and citations from the observed facts and retrieved clauses. Submit a tool call; do not print JSON or stop with prose.`;
}
