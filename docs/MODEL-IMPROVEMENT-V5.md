# Agent v5 reliability experiment

V5 keeps the pinned `qwen3:4b-q4_K_M` model, CPU execution, four model calls, six tool calls, 512 output tokens per call and a two-minute case limit. It changes policy retrieval and instructions. The model selects a constrained policy topic, sees the original clause text and action label, and must compare the clause conditions with trusted facts. The three tools and deterministic validator retain their existing authority. There is no approval or execution tool.

## Registered evaluation

The [plan](../eval/plans/model-experiment-v5.json) selects 32 development cases, four per family, and sixteen reserved cases, two per family. Selection uses only registered metadata and a fixed SHA-256 ranking. It excludes all 48 cases used in earlier model held-out evaluations. The development gate was registered as at least 30/32 valid proposals, complete terminal/SQL/authority evidence and zero accepted incorrect actions, model reviews, approvals or effects. Missing and rejected proposals remain in the denominator.

These are previously unattempted model cases within existing template lineages, not a new-template benchmark. Comparisons with earlier versions use different subsets and are unpaired. Earlier v4 failures informed the general retrieval hypothesis. They were not reused as v5 development cases.

## Development attempts

R1 produced **18/32 valid proposals**, fourteen rejected proposals and no missing output. Ten rejected proposals had incorrect actions; four selected the expected action but lacked its required citation. Traces showed cancellation-topic overuse and confusion between a reviewed refund and a manual-review action. This version did not qualify for freeze. Its [original workflow](https://github.com/mekala27-45/handoff/actions/runs/41915794448), [preserved exports](../reports/model-experiments/41915794448) and [independent regrade](../reports/checks/model-v5-r1-regrade.json) remain available.

R2 restored the original policy action label, separated cancellation-before and cancellation-after topics, and balanced the intent guidance. It reused the same 32 development cases and scored **32/32 valid proposals**, with no rejected or missing proposals. The [original workflow](https://github.com/mekala27-45/handoff/actions/runs/41920762185) ran source `88bfe064932ba80d823b945c7ceeb35a8724eeda`; report `model-development-v5-1793829472919` records every case. All forty export hashes matched. Independent replay confirmed complete SQL and authority observations, zero accepted incorrect proposals and zero model reviews, approvals or effects.

## Authenticated freeze

[Freeze workflow 41926395435](https://github.com/mekala27-45/handoff/actions/runs/41926395435) authenticated the original R2 artifact, checked its actual source, CPU preflight, calibrated authority audit and stored SQL proposals, then froze the configuration at `2026-11-04T22:34:24.351Z`.

Configuration digest: `a49b5cd52e155f8f2362bb093d91b4ee4f01cbc64f81b2fe4d0260a510fe1ee4`.

The original [frozen configuration](../eval/plans/model-config-v5.json) and [pre-freeze attestation](../reports/checks/model-v5-pre-freeze.json) were imported byte for byte from evidence commit `826152c49bbefe4544a99ca52d7da9cccbb1aeff`. The held-out source is `50f4989ff94da4e4b9ffc66173b0fabb176b6324`.

## Reserved result

The one-time [reserved workflow 41926653086](https://github.com/mekala27-45/handoff/actions/runs/41926653086) is in progress. Its score is not yet available. This configuration will not be tuned or retried against those outcomes. Release preparation must authenticate the original artifact and independently regrade all sixteen records before publishing a result.

Scripted workflow results remain separate from actual model results. The workbench displays recorded model evidence; it does not host this model. No model proposal is approved or executed by this experiment.
