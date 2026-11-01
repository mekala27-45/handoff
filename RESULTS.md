# Handoff measured results

Local candidate built. Public release is incomplete. The workbench and API require starting their local servers; they are not currently running. There is no verified hosted API URL, Pages URL, public repository or release tag.

Continuation on November 1, 2026: all 19 unit tests, all three type checks, the production site build and deterministic fixture rederivation passed. A fresh integrated run was blocked at migration: the Neon hostname could not resolve, and the disposable loopback PostgreSQL connection returned EACCES under the current execution restrictions. The earlier passing integration and browser evidence remains historical evidence, not a current full-suite pass. Independent regrading again passed all 750 stored baseline and applicable fault snapshots. No model inference or fault injection was rerun during this continuation. The clean-worktree offline rebuild passed on commit `351f01a53890b1530616e76e72b24a082a37152a`; see `reports/checks/clean-offline-continuation.json`. It reused copied installed dependencies, so it is not a fresh dependency installation. The archive is a source review package, not a verified hosted release.

Synthetic support cases. Simulated actions only. Scripted, local-model and recorded runs are labeled separately. No real messages, refunds or customer data. This project does not demonstrate production customer-service readiness.

The most consequential observed limitation is that the actual CPU model made tools calls but produced no acceptable typed proposal in any of sixteen registered attempts. No model proposal was approved or executed. The browser demonstrates the scripted workflow.

## Verification and provenance

The exact integrated-suite source commit is `reports/checks/verification.json:source_commit`. The exact independently rebuilt source commit is `reports/checks/clean-rederivation.json:source_commit`. Read the pass flags in those files; the final evidence-only commit does not silently inherit a test result. `docs/release-candidate.json` and `reports/checks/release-readiness.json` keep hosted and authorization gates closed. A full release tag has not been prepared.

| Evidence | Run | Original source commit |
| --- | --- | --- |
| Scripted baseline, audit version two | `scripted-1793502995185` | `d0edd4ce73cf5aa2f9ee0b31ae53cc683452c09f` |
| Complete fault matrix, audit version two | `faults-1793502995134` | `d0edd4ce73cf5aa2f9ee0b31ae53cc683452c09f` |
| Actual CPU model, configuration version two | `model-heldout-v2-1793501352417` | `eb49a2d5a05ab62d1223dddd5e6636bdca57d9fe` |

Each run has a manifest and per-case table under `reports/runs`. The model traces live under `reports/model-traces`. The fault injector journal is `reports/faults/faults-1793502995134-injectors.jsonl`. Each manifest includes source, dependency, dataset, policy and configuration digests, attempted IDs and observation timestamps. Reconciliation is reproducible with `scripts/publish-reports.ts`, `scripts/diagnostics.mjs` and `scripts/regrade-audit.ts`.

Dataset SHA-256: `ca9660440ba1ee74c6ae406ec15bad99e5a88c699985c2b50e6d911b07609834`. Registered plan digest: `36738662e2877bdcd4a86c8c0042494b804214ba15d9a12366fcbae2a5e3f7be`. CPU model digest: `7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435`. CPU configuration digest: `a4e5b0ef9d0df7c12c510bc42178075dbb09bf163fc55d8b9e17d28e50fec61f`.

## Primary observations

| Claim | Observed result | Source |
| --- | --- | --- |
| Scripted development proposal correctness | 80 / 80 | Scripted manifest and independent truth |
| Scripted held-out proposal correctness | 80 / 80 | Scripted manifest and independent truth |
| Scripted safe terminal state | 160 / 160 | Independent capture, order, effect, draft and event audit |
| CPU model proposal correctness | 0 / 16 | All registered CPU attempts |
| CPU model actual tool execution | 15 / 16 cases; 18 recorded handler requests | Actual eve channel and tool traces |
| CPU model evidence-complete proposals | 0 / 16 | Missing typed proposals remain failures |
| CPU model required reference slots | 0 / 32 | One policy citation and one fact-version binding per attempt; all proposals missing |
| CPU model missing typed output | 16 / 16 | Model case table |
| CPU model unsafe typed proposals | 0 / 16, with 16 missing outputs | This is not evidence of successful or safe autonomous resolution |
| CPU model committed effect safety | Not evaluated; zero executed proposals | Never rendered as a success percentage |
| Applicable fault injection coverage | 590 / 590 | Observed barriers or checked mutations |
| Correct recovery after applicable injection | 590 / 590 | Independent final-state audit |
| Non-applicable overlays | 50 / 640 planned overlays | Identity refusals have no relevant execution boundary |
| Unauthorized monetary effects | 0 / 240 simulated effects | Final scripted and fault SQL snapshots |
| Excess monetary effects | 0 / 750 audited case-runs | Every case permits at most one monetary effect |
| Reviewed draft dispositions | 320; no audit violations | Draft authority, amount, currency and atomic event checks |

The final 750 audits comprise 160 baseline cases and 590 applicable fault case-runs. They contain 240 simulated monetary effects and 320 draft dispositions. Expected refusals and stale or expired authority account for the remaining terminal states. Independent regrading of all 750 snapshots passed in `reports/checks/audit-regrade.json`. Earlier or interrupted runs do not contribute to these totals.

The complete metric table, with mode, split, numerator, denominator, input digest, query and measured time, is `reports/diagnostics/final.json:metrics`. The same file contains all sixteen paired cases and both disposition confusion matrices. The workbench exposes this data as recorded evidence and provides a download.

| Expected disposition in the common sixteen | Scripted correct | Model missing output |
| --- | --- | --- |
| Propose refund | 6 / 6 | 6 / 6 |
| Draft manual review | 4 / 4 | 4 / 4 |
| Draft escalation | 2 / 2 | 2 / 2 |
| Draft confirmation | 2 / 2 | 2 / 2 |
| Request identity review | 2 / 2 | 2 / 2 |

The scripted baseline produced all 42 expected manual-review dispositions and zero unexpected manual-review dispositions. A matching manual-review disposition is not an automatic resolution. The model produced zero of four expected manual-review dispositions; its missing outputs are not safe abstentions. Its invalid-output reason is `missing_typed_proposal` in all sixteen cases.

## Recovery matrix

| Fault | Applicable | Exercised | Passed | Not applicable |
| --- | --- | --- | --- | --- |
| Duplicate intake | 80 | 80 | 80 | 0 |
| Read timeout | 80 | 80 | 80 | 0 |
| Invalid proposal | 80 | 80 | 80 | 0 |
| Stale order | 70 | 70 | 70 | 10 |
| Expired review | 70 | 70 | 70 | 10 |
| Crash before commit | 70 | 70 | 70 | 10 |
| Response lost after commit | 70 | 70 | 70 | 10 |
| Concurrent execution | 70 | 70 | 70 | 10 |

Process faults reached an IPC barrier, wrote a parent-side journal, terminated the task-owned HTTP worker and verified the disconnected client. Before retry, the independent reader checked the committed receipt and monetary delta. Crash-before-commit left neither committed receipt nor balance change. Post-commit response loss retained the committed result. Retry and recovery returned the stored business outcome. The browser response-discard control is separately labeled as a client demonstration.

## Device, timing and usage

The model was Qwen3:0.6b Q4_K_M through portable Ollama 0.40.13 and eve 1.0.0-rc.1. All sixteen CPU attempts recorded `size_vram: 0` and an 8192-token context before execution. Hardware and pinned assets are in `docs/sources/model-hardware.json`, `model-lock.json` and `ollama-release.json`. All calls used loopback inference; there was no hosted-model key.

Provider usage was available for 47 / 47 actual model requests: 62,372 input tokens and 11,781 output tokens. The provider separately reported 48,378 cache-read tokens. These are recorded provider fields, not a cost calculation. Fifty framework start/settle intervals include attempts stopped by the call budget, so that event count is not the provider-request count.

| Observed sample | n | Median ms | Empirical p95 ms | Clock |
| --- | --- | --- | --- | --- |
| Scripted full case, local PostgreSQL | 160 | 15.76 | 35.47 | Monotonic |
| CPU model full case, direct Neon | 16 | 15,155.10 | 23,172.75 | Monotonic |
| Recorded model tool handler interval | 18 | 953.50 | 1,487.00 | UTC wall time |
| Recorded framework model phase interval | 50 | 4,205.50 | 7,584.00 | UTC wall time |

Median averages the middle observations for even sample sizes. The empirical p95 is the observation at rank `ceil(0.95*n)`. For sixteen cases it is the maximum, not a reliable population-tail estimate. No p99 or statistical significance claim is made. Tool and model phase timing was not instrumented with a monotonic timer, so its wall-clock intervals have a known measurement limitation. Human wait is excluded. The model was warmed before evaluation. Different environments and workloads prevent a valid speed comparison between these rows.

Final exhaustive scripted and fault runs used task-local PostgreSQL 18.6, listening only on loopback, with `fsync=on` and `synchronous_commit=on`. The archive provenance and observed checksum are in `docs/sources/local-postgres.json`. Earlier integration tests and a 160-case scripted run passed against direct Neon. This establishes database-backed local behavior, not a hosted API result.

## Preserved failures and limits

The original held-out model run unexpectedly used Vulkan. Its nonzero-VRAM probe and original reports are retained under their version-one names. Version two disabled every GPU backend and checked placement before each case without changing model instructions, tool descriptions or selected IDs. Both model configurations produced zero acceptable proposals. This correction is a hardware-control change, not a hidden successful rerun.

Early scripted and fault development exposed serializable-snapshot conflicts and a transaction-pool advisory-lock incompatibility. The final direct-connection transaction guard acquires a session lock before opening the serializable snapshot. Its global serialization limits throughput. Failed and interrupted reports remain under `reports/runs` and `reports/faults`; `cloud-run-interrupted.json` explains the superseded remote checkpoint. The first clean build failure and its later successful correction remain under `reports/checks`.

The isolated Neon project reports the Free plan and no new card or upgrade was requested. The connected Vercel account read did not expose its plan; a successful no-card hosted deployment has not been established. Container and Node Function adapters are prepared but unverified on Vercel. Remote CI and Pages have not run. Automatic approval review rejected source/fixture upload and the separate export of the isolated database credential to Vercel. See `docs/RELEASE.md` for the concrete authorized next steps.

## Mandatory checklist

1  not done Dependency, model and no-card host probes recorded; evidence: `docs/sources/host-probes.json` records unresolved Vercel plan/live probe.
2  done Claim renderer rejects missing or invalid evidence; evidence: `tests/unit/claims.test.ts` and final unit report.
3  done Synthetic data, split and independent truth registered; evidence: dataset digest `ca9660440ba1ee74c6ae406ec15bad99e5a88c699985c2b50e6d911b07609834`.
4  done Isolated schema and independent persistence check pass; evidence: `reports/checks/integration.txt`.
5  done Scoped retrieval and evidence version checks pass; evidence: `tests/unit/policy.test.ts` and integration report.
6  done Proposal and monetary policy gates pass; evidence: `tests/unit/policy.test.ts` and independent audit report.
7  done Approval digest, expiry and stale-review gates pass; evidence: `tests/integration/approval-clock.test.ts` and integration report.
8  done One simulated effect survives duplicate execution; evidence: `eval/harness/audit.ts:ledgerQuery` and fault case table.
9  not done Functional live API verified from a separate client; evidence: no hosted URL; `docs/sources/host-probes.json`.
10  done Case workbench supports review and honest error states; evidence: `reports/checks/browser.json`.
11  done Actual eve model-generated tool call demonstrated; evidence: `reports/model-traces/model-heldout-v2-1793501352417-fx_75cd07ef28f02794e586.json`.
12  done Registered model attempts graded with full provenance; evidence: `reports/runs/model-heldout-v2-1793501352417.json` (0 / 16 correct).
13  done Applicable failure injections and recovery checks pass; evidence: `reports/runs/faults-1793502995134.json` (590 / 590).
14  not done Evaluation views separate scripted, model and recorded runs; evidence: implementation and browser test exist; latest browser verification is blocked by loopback connection restrictions.
15  done Both palettes and required interface checks pass; evidence: `reports/checks/palette.json` and browser report; not a whole-site accessibility audit.
16  done Runbook, ADRs, skills and public-artifact scans complete; evidence: `docs`, `skills`, `reports/checks/skills.json`, `reports/checks/artifact-scan.json`.
17  not done Full suite, clean rederivation and live checks complete; evidence: local suite and clean checks recorded; hosted checks pending.
18  not done Verified release tag prepared and authorized publication complete; evidence: no tag; `reports/checks/release-readiness.json` refuses release.

## Skills evidence and deferred work

`docs/SKILLS-MATRIX.md` links the implemented capabilities to completed checks. The three repository coding-agent workflows cover support-policy review, failure recovery and evidence publishing; their official validator output is retained. They are repository guidance, not deployed autonomous agents.

No stretch item was started. The unresolved mandatory work is explicit public publication authorization, account-plan verification, actual Vercel deployment, separate-client hosted workflow checks, Pages publication and verification, remote CI, and a verified release tag after all gates pass. No social post or email is authorized by this build.
