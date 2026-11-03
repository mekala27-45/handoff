# Reviewable release procedure

The owner authorized GitHub publication, Vercel deployment and the isolated Neon credential's server environment destination on November 1, 2026. The source and fixtures are published, the API container is deployed, and its full synthetic HTTP workflow passed from an independent client with a separate SQL audit. The credential is stored as a sensitive Vercel variable. The first deployment safely rejected a pooled URL; the corrected deployment uses the direct endpoint.

The owner subsequently explicitly approved publishing evaluation reports, model traces and fault diagnostics under reports/ and apps/site/public/reports/ on November 1, 2026. Preserve earlier failed and interrupted attempts along with the final reports. Existing SSO settings need no change; the production alias accepts ordinary independent requests.

The release workflow consumes fresh CI artifacts, a successful Pages run and hosted HTTP/browser checks for one immutable source commit. The v0.3.0 workflow invokes `scripts/finalize-release-v4.mjs`, which first runs the original release checks and then verifies v4 evidence. It emits release-assets/release-candidate.json, release-readiness.json, hosted.json, model-experiments.json and RESULTS.md outside the source tree, then creates the annotated tag only after those checks pass. The existing v0.1.0 and v0.2.0 tags and assets remain immutable. This avoids embedding a future commit SHA in its own source. The tracked docs/release-candidate.json and source RESULTS.md checklist are historical evidence; the release assets are authoritative for the tagged candidate. Validate the downloaded candidate with node build/scripts/check-release.js PATH_TO_RELEASE_CANDIDATE_JSON after compiling.

The prepared scope is a public GitHub repository named `handoff`, a Vercel API project named `handoff`, and a GitHub Pages workbench. The source contains original synthetic fixtures, evaluator truth for reproducibility, sanitized run evidence and three coding-agent workflows. Runtime and site artifacts exclude evaluator truth, private logs, capabilities, credentials and model weights. No social post, email or other public message is included.

## Before publication

1. Run `npm ci` and `npm run verify` on the candidate commit. Read every result in `reports/checks/verification.json` and the artifact scan. A local pass does not imply the hosted path passed.
2. Complete the registered scripted, model and failure evaluations. For v4, require the real SQL authority calibration before model inference, qualify the complete balanced development sixteen, freeze the exact operating point, and then run the untouched reserved held-out sixteen once. Preserve failed development runs, incomplete audits, GPU version one, CPU version two and interrupted checkpoints.
3. The original baseline publisher, `node build/scripts/publish-reports.js SCRIPTED_RUN_ID MODEL_RUN_ID`, rebuilds the original index. Append v3 results with `node build/scripts/publish-model-experiment.js EXPLICIT_RUN_ID...` and v4 results with `node build/scripts/publish-model-experiment-v4.js EXPLICIT_RUN_ID...`; these preserve the original results and separate versioned experiment objects. Import original workflow publication/export manifests and raw case/trace bytes first. The release gate regrades actual SQL observations and verifies frozen hashes, original GitHub artifacts, complete denominators and fresh held-out scope. Failed model quality is reported honestly; it is not a passing quality claim.
4. Record clean rederivation and the exact tested commit. Review the eighteen mandatory statuses in RESULTS. No full-completion tag can be prepared while a mandatory gate is unresolved.
5. Obtain explicit authorization for the named source publication and server-secret destination. Do not include the credential in a repository or client artifact.

## V4 evidence for v0.3.0

The wrapper adds v4 provenance under `model-experiments.json.v4` and the matching release-readiness model section, then appends a separate v4 section to generated RESULTS. It preserves the original v3 summary and checklist. Before publish it verifies that the candidate, tag, attestation and summary agree and refuses either historical tag. A prepared v0.3.0 workflow is not proof that its release or model-quality gates have passed.

The v4 gate checks the committed plan, complete sixteen-case scopes, fresh held-out exclusions, locked model/runtime, frozen hashes and the actual model source commits. It downloads each original GitHub artifact and compares report/trace bytes before independently regrading actual SQL observations. The matching qualifying development run must reach fourteen correct out of sixteen with zero accepted incorrect proposals. Both final runs require complete proposal and authority reads, zero approvals/effects/review records, and truthful full-denominator metrics. A failed quality result must remain a failed quality result.

Keep calibration canaries separate from model cases. Calibration deliberately creates scripted synthetic approvals, monetary effects and draft dispositions to prove the independent counter can see them, then deletes its own sessions. Model trials have no approval or execution tool and must independently demonstrate zero authority use. The initial pilot with an invalid authority query remains diagnostic evidence and cannot qualify freeze. Do not claim a new score, frozen configuration, held-out completion or release until its original records and gates exist.

## Hosted API after authorization

The first choice is the Vercel Container preset and `Dockerfile.vercel`. Node 24.19.0 and the base image digest are pinned. The service binds port 80 and runs as the unprivileged Node user. The prepared Node Function adapter in `api/index.ts` and `deploy/vercel-function.json` is the fallback; hosted compatibility remains unverified until an actual deployment.

Configure the direct isolated `DATABASE_URL` only as a sensitive server variable. Set `SOURCE_COMMIT`, `BUILD_TIMESTAMP` and an exact allowed Pages origin. Review Vercel deployment protection and the account plan before exposing the public demo. No paid upgrade, card entry or new paid service is authorized by the build.

From a separate client and browser, verify readiness, CORS, no-store responses, intake, evidence, review, execution, repeated execution, recovery and an independent ledger count. Save sanitized HTTP evidence and source commit. A healthy endpoint alone does not satisfy this gate.

## Pages after authorization

The Pages workflow builds each main candidate with immutable action SHAs and requires a configured HTTPS API. Configure the repository Pages environment and dispatch only after the API passes the full hosted path. Open the actual Pages URL in a fresh browser, repeat the review flow, check small-screen layout and confirm recorded model labels.

The CI workflow uses an isolated PostgreSQL service, no hosted database secret and no model key. The Pages workflow grants Pages and identity-token permissions only to the deploy job. CI and Pages run remotely for the candidate, and the release gate requires successful runs and the deployed source marker for that exact commit.

## Tag and archive

Create the final annotated release tag only when all eighteen mandatory gates are complete on the named candidate. Tag publication is a separate authorized action. A blocked release remains an explicitly incomplete local candidate. Do not label it a verified full release.

The source archive is an export for review, not proof of hosted availability. Keep reports/checks and original per-run provenance. Never add `.env`, `.local`, `.eve`, transient capabilities or model weights to the archive.
