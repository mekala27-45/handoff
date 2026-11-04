# Handoff v5 reliability experiment

V4 remains frozen and published in v0.3.0: 12/16 valid proposals, three rejected and one missing. Its failed cases revealed cancellation retrieval and shipping-condition mistakes. Their traces informed this general hypothesis, but they are not v5 development cases and will not be reported as fresh evidence.

V5 retains the verified Qwen3 4B Q4_K_M CPU model and all original limits. It changes policy retrieval to a model-selected topic enum, shows exact clause text and versioned references without a ranking score or default action label, and instructs the model to compare conditions with trusted facts. The three tools and deterministic validator are unchanged in authority. No model proposal can approve or execute.

The registered development scope has 32 cases, four per family. The reserved scope has 16 previously unattempted model cases, two per family, excluding all 48 v2/v3/v4 model held-out cases. Selection uses only existing registered metadata and a fixed SHA256 ranking. These cases share existing template lineages and do not establish new-template generalization. Scores on different subsets are not paired comparisons.

Freeze requires at least 30/32 correct development proposals, complete terminal records and independent SQL/authority evidence, and zero accepted incorrect actions, approvals or effects. All failed attempts remain evidence. Development runs use agent-quality-v5. Reserved inference uses the separate agent-heldout-v5 branch only after a committed freeze; ordinary development pushes cannot select held-out automatically.

Current status: candidate implemented; local and remote checks and actual development inference pending. No v5 model score is claimed.
