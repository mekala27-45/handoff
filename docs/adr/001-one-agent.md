# One agent with a narrow proposal boundary

Status: accepted for the synthetic demo.

One eve agent runs on a local Qwen model. Exactly three discovered tools are permitted: get_order_facts, find_policy_clauses and propose_resolution. A request-time inventory assertion inspects the provider payload before inference. Default tools and extensions are disabled. No model tool can approve, execute, fetch a URL, run SQL or read files.

The browser uses deterministic scripted decisions. Recorded local-model evaluations have their own labels, IDs and denominators. This avoids requiring a hosted model for a public demonstration and permits a weak model result to remain visible.

The agent database role can read required workflow records and insert proposals, events and request receipts. It cannot insert reviews, effects or dispositions and cannot change balances. PostgreSQL locking reads require limited UPDATE permission on identity columns. The role receives no balance or policy-version update permission. The application still enforces capability and customer scope.

Consequences: this is not an autonomous customer support system. A small model can stop, invent an identifier or exhaust its budget without producing a proposal. Those cases remain model failures even when the authority boundary holds.

Evidence: agent/agent.ts, agent/lib/runtime.ts, packages/db/agent-role.sql, tests/integration/agent-role.test.ts and reports/model-traces.
