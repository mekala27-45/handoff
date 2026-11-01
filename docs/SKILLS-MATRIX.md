# Evidence of implemented capabilities

Read the original source commits in each run manifest and the exact final-suite commit in `reports/checks/verification.json`. This table describes observed implementation evidence, not employment experience or production readiness.

| Capability | Completed evidence | Limit |
| --- | --- | --- |
| Workflow design | Unit and integration state-transition checks; 160 / 160 scripted baseline | Authored synthetic domain |
| Tool-using agent | CPU traces: 15 / 16 cases with actual tool execution | 0 / 16 acceptable proposals |
| Retrieval and policy | `policy.test.ts`, independent golden truth and adversarial-ticket tests | Fixed fictional policy |
| Human review | Approval digest, stale revision and post-lock expiry integration tests | Demo capability, no enterprise identity |
| Transactions and idempotency | Independent persistence, rollback and concurrent execution tests | Global advisory guard limits throughput |
| Recovery | 590 / 590 applicable fault records; 140 observed process terminations | Local PostgreSQL and task-owned workers |
| API | HTTP integration tests for full path, CORS, schemas, scope and no-store | Hosted API not verified |
| Evaluation | Registered 80 / 80 split, balanced sixteen-model subset, calibrated oracle and audit | No statistical generalization |
| Observability | Safe browser event timeline, provenance manifests, paired cases and fault journals | No production monitoring claim |
| Cost controls | Local inference, bounded calls and writes, dated Neon Free probe | Vercel plan remains unverified |
| Frontend and accessibility | Browser review, errors, missing reports, keyboard dialog, mobile, reduced motion, zoom; both palette passes | No whole-site accessibility audit |
| CI and deployment | Pinned workflows and runtime artifacts pass local scans | Remote CI and live deployment pending |
| Technical writing | Runbook, four ADRs, RESULTS and repository skills | Publication procedure explicitly blocked |
| Reproducibility | Exact lockfile, source digests, two hash-seed derivations and clean-worktree checks | UUIDs, timings and model output vary |
