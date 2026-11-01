import { defineTool } from 'eve/tools';
import { policySearchInputSchema } from '../lib/tool-schemas.js';
import { application,budget,record } from '../lib/runtime.js';
export default defineTool({description:'Find up to three versioned fictional policy clauses. Use concise terms such as damage, delay, cancel before, cancel after, duplicate, window, identity or refunded.',inputSchema:policySearchInputSchema,async execute(input){const s=await budget('tools');await record('model_tool_request',{tool:'find_policy_clauses',input});const result=await application.getPolicies(s.capability,s.case_id,input.query);await record('tool_result',{tool:'find_policy_clauses',result});return result;}});
