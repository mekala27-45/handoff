---
name: evidence-publishing
description: Prepare Handoff measured claims and release artifacts. Use when updating evaluation pages, RESULTS, a release candidate or deployment evidence.
---

Accept explicit completed run IDs and a candidate source commit. Run npm run verify. Run node build/scripts/publish-reports.js SCRIPTED_RUN_ID MODEL_RUN_ID with actual IDs from reports/runs. The command requires complete case tables and reconciles every published numerator and denominator. Read docs/RELEASE.md and RESULTS.md. Verify runtime and site artifacts exclude evaluator truth, credentials, weights and private traces. Expected output: reconciled recorded reports, exact tested commit, eighteen checklist statuses and a publication package. Stop on missing evidence, a changed frozen configuration, failed scans, an unverified live URL or missing publication authorization. Do not create a full-completion tag before all mandatory gates pass. Never send a public message.
