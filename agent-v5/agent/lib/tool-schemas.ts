import { z } from 'zod';

export const orderFactsInputSchema=z.object({order_id:z.string().max(100)}).strict();
// Extra search fields carry no authority and never reach retrieval or its trace.
export const POLICY_TOPICS=['damage window','delay review','cancel','duplicate review','window','identity','refunded'] as const;
export const policySearchInputSchema=z.object({query:z.enum(POLICY_TOPICS)}).strip();
export const proposalInputSchema=z.object({
 action_code:z.enum(['propose_refund','draft_escalation','draft_manual_review','draft_confirmation','request_identity_review']),
 cited_clause_ids:z.array(z.string()).min(1).max(3),
 snapshot_token:z.string().min(1).max(16),
 rationale:z.string().max(500)
}).strict();
