import { defineTool } from 'eve/tools';
import { policySearchInputSchema } from '../lib/tool-schemas.js';
import { application,budget,record } from '../lib/runtime.js';
import { visiblePolicyClauses } from '../lib/policy-view.js';
export default defineTool({description:'Retrieve versioned policy clauses for one topic. For cancellation choose cancel to read both shipping conditions. Compare full clause text with trusted facts; retrieval is not an action recommendation.',inputSchema:policySearchInputSchema,async execute(input){const s=await budget('tools');await record('model_tool_request',{tool:'find_policy_clauses',input});const result=await application.getPolicies(s.capability,s.case_id,input.query);await record('tool_result',{tool:'find_policy_clauses',result});return visiblePolicyClauses(result);}});
