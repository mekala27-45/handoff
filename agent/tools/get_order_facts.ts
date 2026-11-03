import { defineTool } from 'eve/tools';
import { orderFactsInputSchema } from '../lib/tool-schemas.js';
import { application,budget,record,rememberFactsSnapshot,rememberRefusedSnapshot } from '../lib/runtime.js';
export default defineTool({description:'Read the current synthetic order within trusted customer scope. Return snapshot_token for the proposal. Identity refusal discloses no order facts.',inputSchema:orderFactsInputSchema,async execute(input){
 const s=await budget('tools');await record('model_tool_request',{tool:'get_order_facts',input});
 let facts:Awaited<ReturnType<typeof application.getOrderFacts>>;
 try{facts=await application.getOrderFacts(s.capability,s.case_id,input.order_id);}catch{
  const result={refused:true,code:'identity_or_scope_refused',snapshot_token:await rememberRefusedSnapshot()};
  await record('tool_result',{tool:'get_order_facts',result});return result;
 }
 const snapshot_token=await rememberFactsSnapshot(facts.fact_versions);
 await record('tool_result',{tool:'get_order_facts',result:{...JSON.parse(JSON.stringify(facts)),snapshot_token}});
 const {fact_versions,...visible}=facts;
 return {...visible,snapshot_token};
}});
