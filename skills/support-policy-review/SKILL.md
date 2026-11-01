---
name: support-policy-review
description: Review Handoff scoped retrieval, policy evidence and proposal changes. Use when changing policy decisions, evidence references or monetary validation.
---

Accept only synthetic fixtures, a proposed code diff and a registered evaluation plan. Read AGENTS.md and docs/adr/002-authority.md. Run npm run check, npm test, then npm run test:integration when persistence changes. Inspect tests/unit/policy.test.ts and tests/unit/oracle.test.ts. Require a clean example, deliberate invalid example and empty-input refusal. Check integer cents, UTC boundaries, exact policy references and trusted customer scope. Expected output: test results and a concise explanation of affected invariants. Stop if truth is imported into runtime, approval enters model inputs, evidence cannot be tied to a version, or a test needs real customer data.
