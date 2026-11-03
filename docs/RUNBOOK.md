# Handoff operations

## Boundaries and resources

All domain data is synthetic. No payments, messages or refunds leave this application. Operate only the isolated Handoff database and task-owned local processes. The created Neon project is `royal-hall-19630471`, branch `br-withered-tooth-b4xpw9kb`, database and schema `handoff`. The Vercel project is named `handoff`; its production API is https://handoff-blond-one.vercel.app and its direct database URL is stored only as a sensitive server variable.

The server requires a direct PostgreSQL connection. A transaction-pooled connection is incompatible with its session-scoped advisory guard. Keep the pool small. The guard serializes domain transactions across instances and is an explicit throughput limitation, not a scalable architecture claim.

## Start and inspect

Follow README for installation, migration and the two local servers. `GET /health` reports the source commit, build time and simulated-action capabilities. `GET /ready` checks the schema version. Readiness is a prerequisite, not proof of a complete effect path.

Create a session with `POST /demo/sessions` and an empty JSON object. Keep the returned capability in memory. Send it as a Bearer token for subsequent operations; never log it. Public intake accepts only IDs returned by `GET /fixtures`. Every mutation requires a fresh request key, except a retry of the same operation, which reuses the original key and exact body.

Inspect `GET /cases`, `GET /cases/:id`, `GET /cases/:id/events?after=N` and `GET /operations/:key`. A revision conflict requires refreshing the case. A stale or expired proposal requires an explicit revision request and new review. Do not retry authorization or policy failures blindly.

## Unknown commit outcome

Preserve the original operation key and input. Read the receipt. If it exists, recover that stored result. If the database is unavailable, keep the outcome unknown. Retry the same request after connectivity returns. Never insert an alternative effect through another system.

The executor returns an existing effect even after its original approval expires. This behavior prevents a committed action from becoming unrecoverable because a response was lost.

## Model evaluation

### Current v3 protocol

The current agent uses the [v3 plan](../eval/plans/model-experiment-v3.json), [frozen configuration](../eval/plans/model-config-v3.json) and [experiment history](MODEL-IMPROVEMENT-V3.md). The configuration records the exact agent, harness, runner and workflow hashes. Source hashes normalize line endings to LF. `HANDOFF_MODEL_EXPERIMENT=v3` must be present in both the Eve process and the model harness environment. Use `build/eval/harness/model-experiment.js` for v3; `npm run eval:model` still invokes the historical v2 harness.

The [model workflow](../.github/workflows/model-experiment.yml) runs actual CPU inference on Linux with a disposable PostgreSQL 18 service. It downloads the official Ollama archive pinned in [the Linux runtime lock](sources/ollama-linux-release.json), checks its SHA-256 and verifies the exact Qwen digest in [the model lock](sources/model-lock.json). CPU preflight requires zero VRAM and an 8192-token context; its one-token warm-up is excluded from graded attempts. No model weights are committed.

For an explicit development replay on a Linux host, first install the locked dependencies as described in README. Prepare a private `.env.evaluation` containing the direct connection to a disposable local database named `handoff`. Verify and extract the pinned Linux Ollama binary, then supply its absolute path:

```sh
export HANDOFF_MODEL_EXPERIMENT=v3
export HANDOFF_OLLAMA_BINARY=/absolute/path/to/verified/ollama
npm run compile
node --env-file=.env.evaluation scripts/run-model-experiment.mjs --development
```

This runner accepts only a loopback database connection, migrates that disposable database, applies the restricted agent role and starts only its own Ollama and Eve processes. It generates the private evaluation channel key in memory and passes the v3 environment to both Eve and the harness. It exports sanitized reports and stops its own services. A hosted Neon connection or an arbitrary Ollama executable is not a substitute for this recorded environment.

The frozen development run, [model-development-v3-1793634649670](../reports/runs/model-development-v3-1793634649670.json), produced 8 acceptable proposals from the complete balanced sixteen-case development suite. Earlier configurations and failed startup attempts remain in the experiment history. A new development replay is another recorded attempt, not new held-out evidence.

The reserved v3 evaluation uses the explicit `--held-out` split and requires the committed frozen configuration. It selects two cases per family within the existing held-out split, excluding the original sixteen model cases. That reservation is already in use; repeating it must be labeled a repeated evaluation and cannot become a fresh score. Do not tune the frozen agent from its held-out outcomes. A later operating point needs a new versioned plan and untouched evaluation scope.

Four model calls, six tool calls, 512 output tokens per call and a 120-second case deadline remain hard bounds. Runner success is infrastructure evidence; only independent grading of an actually stored proposal counts as model correctness. Missing output and failed cases remain in the registered denominator.

The three model tools inspect scoped facts, retrieve up to three clauses and submit a typed proposal. A model proposal never grants approval or execution authority. The isolated channel rejects requests without its private header and runs one active case at a time. The public browser continues to display recorded model evidence alongside a live scripted workflow; it does not provide hosted model inference.

### Historical v2 reproduction

Reproduce the original CPU protocol from a separate clean checkout of [v0.1.0](https://github.com/mekala27-45/handoff/tree/v0.1.0), using the locked dependencies and [runbook at that tag](https://github.com/mekala27-45/handoff/blob/v0.1.0/docs/RUNBOOK.md). That checkout contains the original agent, `eval/plans/model-config-v2.json` and the legacy `npm run eval:model` commands. Its held-out command checks the original v2 frozen hashes and rejects current v3 sources. Its development mode is also a legacy protocol and must not be presented as v3 evidence.

The historical Windows portable Ollama URL and SHA-256 remain in [the Windows runtime lock](sources/ollama-release.json). The recorded CPU v2 run scored 0/16; its original Windows/direct-Neon environment differs from the Linux/local-PostgreSQL v3 experiment. The version-one run used Vulkan and is not CPU evidence. Replaying either protocol does not guarantee identical model output or create an untouched held-out evaluation.

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

The frozen v3 recorded result is 8/16 acceptable proposals on development and 2/16 on the fresh held-out subset. The held-out report retains two validator-rejected incorrect proposals and twelve missing outputs. This is a completed experiment with a failed quality status; it does not establish reliable model decisions or model effect safety.
