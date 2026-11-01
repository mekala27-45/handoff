import { z } from 'zod';

export const orderFactsInputSchema=z.object({order_id:z.string().max(100)}).strict();
export const policySearchInputSchema=z.object({query:z.string().min(1).max(200)}).strict();
export const proposalInputSchema=z.object({
 action_code:z.enum(['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review']),
 cited_clause_ids:z.array(z.string()).min(1).max(3),
 snapshot_token:z.string().min(1).max(16),
 rationale:z.string().max(500)
}).strict();
