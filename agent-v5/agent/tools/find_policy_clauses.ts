import { defineTool } from 'eve/tools';
import { policySearchInputSchema } from '../lib/tool-schemas.js';
import { application,budget,record } from '../lib/runtime.js';
import { visiblePolicyClauses } from '../lib/policy-view.js';
export default defineTool({description:'Retrieve clauses for the customer request. Topics: damage, delay, cancel before, cancel after, duplicate, window, identity, refunded. Choose cancellation topics only for cancellation requests, using trusted shipping state to distinguish before and after. Read action labels with the full policy conditions.',inputSchema:policySearchInputSchema,async execute(input){const s=await budget('tools');await record('model_tool_request',{tool:'find_policy_clauses',input});const result=await application.getPolicies(s.capability,s.case_id,input.query);await record('tool_result',{tool:'find_policy_clauses',result});return visiblePolicyClauses(result);}});
