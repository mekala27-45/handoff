# Recover committed results before reconsidering authority

Status: accepted with a throughput limitation.

Execution commits the effect or draft disposition, updated balances, final case state, event and request receipt in one serializable transaction. Unique business operation and proposal keys prevent a second effect. Existing effects are recovered before checking approval expiry or balances changed by that same effect. The same request key with changed canonical input is a conflict.

A response can be lost after commit. An infrastructure error therefore reports an unknown commit outcome. The client looks up the operation receipt or retries the same request key. It must not synthesize a replacement result.

Independent test processes expose private IPC barriers before commit and after commit before response. The parent records each observed barrier outside the worker, terminates only that child and audits the database from another connection. An unobserved barrier is an injector failure. Identity-blocked cases are explicitly non-applicable to execution faults.

Concurrent development runs exposed SSI conflicts on small, frequently emptied tables. The demo now takes one schema-scoped advisory lock before opening each serializable transaction. Direct PostgreSQL connections are required so the lock and transaction use the same session. Pooled Neon endpoints are rejected. This deliberately limits throughput; it is appropriate only to the stated small public demo.

Observed correction: the first guard experiment used a transaction-pooled endpoint and left a session lock on a pooled backend. That run was interrupted and its partial records retained. The task-owned lock was released, the direct endpoint was independently verified and a new run began. Do not use this design behind transaction pooling.

Evidence: packages/db/client.ts, eval/harness/fault-worker.ts, eval/harness/faults.ts and reports/faults.
