# Handoff operations

## Boundaries and resources

All domain data is synthetic. No payments, messages or refunds leave this application. Operate only the isolated Handoff database and task-owned local processes. The created Neon project is `royal-hall-19630471`, branch `br-withered-tooth-b4xpw9kb`, database and schema `handoff`. The Vercel project is named `handoff`; no deployment or server secret has been successfully uploaded.

The server requires a direct PostgreSQL connection. A transaction-pooled connection is incompatible with its session-scoped advisory guard. Keep the pool small. The guard serializes domain transactions across instances and is an explicit throughput limitation, not a scalable architecture claim.

## Start and inspect

Follow README for installation, migration and the two local servers. `GET /health` reports the source commit, build time and simulated-action capabilities. `GET /ready` checks the schema version. Readiness is a prerequisite, not proof of a complete effect path.

Create a session with `POST /demo/sessions` and an empty JSON object. Keep the returned capability in memory. Send it as a Bearer token for subsequent operations; never log it. Public intake accepts only IDs returned by `GET /fixtures`. Every mutation requires a fresh request key, except a retry of the same operation, which reuses the original key and exact body.

Inspect `GET /cases`, `GET /cases/:id`, `GET /cases/:id/events?after=N` and `GET /operations/:key`. A revision conflict requires refreshing the case. A stale or expired proposal requires an explicit revision request and new review. Do not retry authorization or policy failures blindly.

## Unknown commit outcome

Preserve the original operation key and input. Read the receipt. If it exists, recover that stored result. If the database is unavailable, keep the outcome unknown. Retry the same request after connectivity returns. Never insert an alternative effect through another system.

The executor returns an existing effect even after its original approval expires. This behavior prevents a committed action from becoming unrecoverable because a response was lost.

## Model evaluation

The pinned Windows portable Ollama asset, URL and SHA-256 are in `docs/sources/ollama-release.json`. Download that exact asset, verify the digest and extract it under `.local/model-runtime/ollama`. Other operating systems must use the same Ollama version and verify the model digest. No model weights are part of the repository.

```sh
node scripts/model-server.mjs
```

In a second terminal, pull `qwen3:0.6b` through the loopback server. On Windows, set `OLLAMA_HOST` to `127.0.0.1:11435` for the portable CLI before running `ollama.exe pull qwen3:0.6b`. Run the checked preflight:

```sh
node scripts/model-preflight.mjs
```

The preflight checks Ollama and model versions, warms one token, and requires `size_vram: 0` and an 8192-token context. A warm-up is not an evaluated model attempt. The recorded version-one run used Vulkan and must not be presented as CPU evidence.

Set a random private `HANDOFF_EVAL_TOKEN` in `.env`. Apply `packages/db/agent-role.sql` once using the database owner. Start eve:

```sh
node --env-file=.env node_modules/eve/bin/eve.js dev --no-ui --no-default-extensions --host 127.0.0.1 --port 2088
npm run eval:model -- --development
npm run eval:model
```

The harness checks the frozen version-two configuration. It runs one selected development case or all sixteen registered held-out cases. Four model calls, six tool calls, 512 output tokens per call and a 120-second case deadline are hard bounds. Do not change instructions to improve the same held-out run. Create a new explicitly versioned plan and preserve the earlier one.

Model calls are actual local inference. The tools can inspect scoped facts, retrieve up to three clauses and submit a typed proposal. A model proposal is never itself an approval or execution instruction. The isolated evaluation channel rejects requests without the private header and runs one active case at a time.

## Failure evaluation

```sh
npm run compile
node --env-file=.env build/eval/harness/faults.js
```

Inspect the parent injector journal and per-case progress files. The precommit barrier is reached only after business writes have been staged. The postcommit barrier is reached after the effect and receipt have committed but before an HTTP response. The harness kills only the child it just created, observes the lost response and reads the ledger independently before retrying.

A run with no observed barrier fails `injector_not_exercised`. Preserve failed and interrupted runs. Do not combine partial runs into a passing total. Stale-order and expiry faults correctly end in `review_needed` and `expired`, respectively; that safe refusal is their expected result.

The final audit-version-two baseline and full fault matrix used isolated loopback PostgreSQL 18.6. The exact binary archive, observed checksum, port, durability settings and environment are recorded in `docs/sources/local-postgres.json` and `reports/environments`. This portable database is task-local and binds only to 127.0.0.1. It is not a machine-wide service. The API integration suite and an earlier 160-case baseline also passed against the isolated direct Neon connection. The remote fault run was explicitly interrupted and superseded by the complete local run after the independent auditor gained order-aggregate and draft-disposition checks. Its checkpoint is preserved and excluded from the final denominator.

Use a disposable local PostgreSQL 18 database for the exhaustive matrix. Keep `fsync` and `synchronous_commit` enabled. For an alternate environment file, use `node --env-file=.env.evaluation build/eval/harness/faults.js`. The harness records its actual database engine and environment. It exits unsuccessfully if any applicable injection fails. CI includes all eight failure types, including actual worker termination and post-commit response loss; the remote CI job remains unverified until the repository is published.

Reconcile the recorded site data with `node build/scripts/publish-reports.js SCRIPTED_RUN_ID MODEL_RUN_ID`, then run `node scripts/diagnostics.mjs SCRIPTED_RUN_ID MODEL_RUN_ID FAULT_RUN_ID`. The second command validates the common case IDs and writes paired dispositions, fault denominators, ledger counts, timing and usage to downloadable diagnostics. Do not merge timing samples from different database or device environments.

## Retention and cleanup

Session capabilities expire after one day. The public budgets are ten new sessions per minute, twenty cases and two hundred writes per session. Test sessions have a separate explicit budget. Run this maintenance command to remove only expired Handoff sessions and their cascading records:

```sh
node --env-file=.env build/scripts/prune-expired.js
```

Evaluation runs delete only the session IDs they created. Interrupted runs may leave synthetic rows until expiry. Do not drop a database, schema, branch or project as a routine recovery action. Removing the isolated hosted project is a separate explicit owner action.

Stop only the process handles or PIDs recorded when this task started them. Do not use a machine-wide Node or Ollama kill command. Keep `.env`, `.local`, `.eve`, model weights and unredacted logs out of exports.

## Troubleshooting

| Symptom | Interpretation and action |
| --- | --- |
| `direct_database_connection_required` | Replace the pooled URL with the same branch direct endpoint through the normal provider interface. |
| `revision_conflict` | Refresh the case and inspect its current proposal before retrying. |
| `stale_approval` | Business versions changed. Request a new proposal and review. |
| `review_expired` | The transaction did not execute. Obtain fresh authority. |
| `infrastructure_unavailable` | Commit outcome is unknown. Recover by the original operation key. |
| `cpu_model_preflight_failed` | The pinned model is not loaded on CPU with the expected context. Rerun the server preflight. |
| `models_budget_exhausted` | Retain a failed attempt. Do not extend the same held-out case until it succeeds. |
| Missing report | Display Not evaluated. Do not replace unknown evidence with zeros. |
