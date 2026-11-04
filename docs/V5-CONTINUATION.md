# Handoff v5 continuation

V5 is frozen. Its one-time reserved evaluation completed with **13/16 valid proposals**, three validator-rejected incorrect proposals and no missing output. Independent artifact/SQL verification passed with complete records and zero accepted incorrect proposals, model reviews, approvals or effects. The model quality status remains failed. Do not change or rerun this frozen operating point.

R1 development scored 18/32 and remains preserved under `reports/model-experiments/41915794448`, with an independent regrade and visible failure summary. R2 scored 32/32 on the same registered development cases, qualifying the preregistered 30/32 gate. R2 source: `88bfe064932ba80d823b945c7ceeb35a8724eeda`; workflow `41920762185`; report `model-development-v5-1793829472919`. All forty original export hashes matched.

Freeze workflow `41926395435` authenticated the original R2 artifact at source `b746299621a1309a175cea9ef21c7c172fbd8952`. Both original freeze files were imported unchanged from `model-freeze-evidence-v5` commit `826152c49bbefe4544a99ca52d7da9cccbb1aeff`. Configuration digest: `a49b5cd52e155f8f2362bb093d91b4ee4f01cbc64f81b2fe4d0260a510fe1ee4`. Frozen at `2026-11-04T22:34:24.351Z`.

Held-out source: `50f4989ff94da4e4b9ffc66173b0fabb176b6324`; workflow `41926653086`; report `model-heldout-v5-1793831838679`, finished `2026-11-04T22:49:11.380Z`. All 24 export hashes passed. Two errors misread cancellation requests as delay complaints; one ignored missing tracking. These findings did not change the frozen configuration.

Result workflow `41928676312` authenticated the original artifact and freeze, regraded all sixteen cases and prepared publication at source `c7357719a3da10fe19272c5fd55bbb949aa4cd91`. The original publication is on `model-publication-evidence-v5`, commit `2a0a0a8db1ddebd243644af2208770b643439e3f`. All 138 files match its SHA-256/byte manifest. The workbench index was independently regenerated locally from the authenticated records and matches that original file exactly.

The source includes the original raw records, additive public downloads, visible earlier failure and the v0.4.0 release wrapper. The final release still requires fresh candidate CI, matching Vercel API and Pages source markers, hosted browser/download checks and all eighteen build gates. The authoritative completion evidence is the generated assets on [v0.4.0](https://github.com/mekala27-45/handoff/releases/tag/v0.4.0); if that release is absent, publication remains pending.

Local and remote Git histories differ. Never push the local branch blindly. Do not push `agent-quality-v5` or `agent-heldout-v5` merely to inspect evidence: those branches start model inference. Preserve v3/v4 frozen hashes and all prior reports. Model results remain separate from scripted checks, and different held-out subsets are unpaired observations within shared template lineages.
