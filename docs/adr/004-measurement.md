# Separate model quality from workflow and recovery correctness

Status: accepted.

The deterministic fixture generator registers 160 cases, 80 development and 80 held out, over eight authored families. Template lineage and order IDs differ by split. Sixteen balanced held-out IDs are selected by a seeded hash rule before model evaluation. Independent evaluator truth has its own decision table and manually stated golden cases; runtime code cannot import it.

Every registered model attempt remains in the denominator. Missing proposals, unclassifiable outputs, timeouts and infrastructure errors count as failures. Workflow safety does not convert a wrong model answer into a correct answer. Required evidence is graded by the independent evaluator. Unsupported or empty denominators are refused by the claim renderer.

The first held-out run unexpectedly used Vulkan despite CUDA and HIP exclusion. The allocation probe exposed nonzero VRAM. Its original records remain available. A separate version-two configuration disables all GPU backends and checks zero VRAM and the 8192-token context before every case. Instructions, model weights, tool descriptions and selection IDs were not tuned after the first held-out result.

Timing, UUIDs and model output are nondeterministic. Fixture, plan and truth bytes are reproduced under two process hash-seed settings. Recorded reports state their original source commit and configuration, even when the workbench is built later.

The final audit-version-two scripted and fault runs use local PostgreSQL 18.6 with durable commit settings. An earlier Neon baseline and its interrupted fault checkpoints remain separate. The independent auditor checks capture and order conservation, reviewed monetary effects, reviewed draft dispositions and atomic event records. The model quality run uses the original direct Neon environment and is not a database-speed comparison.

Case elapsed times use a monotonic clock. The preserved model trace records tool and model phase timestamps in UTC wall time, so their observed intervals are explicitly labeled and cannot support monotonic phase-latency guarantees. Model-start and settle events include framework attempts refused by the call budget; provider usage counts refer only to the actual model requests. No accepted model proposal means committed model-action safety is not evaluated, rather than zero failures.

Evidence: eval/plans, eval/truth/oracle.ts, tests/unit/oracle.test.ts, docs/sources/model-hardware-v1-gpu.json, docs/sources/model-hardware.json and scripts/publish-reports.ts.
