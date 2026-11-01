# Evidence and review bind one immutable proposal

Status: accepted.

Untrusted ticket text cannot set customer scope, time, balances, policy versions or approval. The server derives amounts in integer USD cents. Policy references include clause IDs, content digests, policy digests and line spans. Facts include order, capture and policy revisions. A proposal stores the canonical envelope digest and validation reasons.

Approval binds that exact digest and fact snapshot. The executor locks the session, case, proposal, review, policy head, order and captures in a stable order. It checks database wall-clock expiry after waiting for business locks. Policy and fact changes invalidate authority. A rejected or expired review requires explicit revision and a new approval.

Identity mismatch is a blocked terminal state. Public detail responses hide order facts and proposal amounts in that state. A temporary browser capability is a demo mechanism, not verified employee authentication.

Consequences: approvals cannot silently carry over to regenerated proposals. Missing facts do not become zero-value refunds. Every simulated monetary effect references a validated proposal and matching unexpired approval.

Evidence: packages/domain/policy.ts, packages/domain/workflow.ts, packages/domain/execution.ts, tests/unit/policy.test.ts and tests/integration/approval-clock.test.ts.
