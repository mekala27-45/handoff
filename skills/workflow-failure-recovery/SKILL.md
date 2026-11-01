---
name: workflow-failure-recovery
description: Verify Handoff retry, crash and lost-response recovery. Use when changing transactions, receipts, approval checks or failure injectors.
---

Accept a disposable Handoff database and the registered synthetic plan. Read docs/RUNBOOK.md and docs/adr/003-recovery.md. Require a direct PostgreSQL connection in the private environment. Run npm run compile, npm run test:integration and node --env-file=.env build/eval/harness/faults.js. The harness owns its child API processes and records barriers before termination. Inspect reports/faults and the completed reports/runs manifest. Expected output: applicable rows, observed injector rows, independent ledger checks and explicit non-applicable reasons. Stop on an unobserved barrier, any unauthorized or duplicate effect, or a database namespace not created for this project. Never terminate an unverified process or broadly delete a schema.
