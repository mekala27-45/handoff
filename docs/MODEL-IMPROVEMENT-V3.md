# Model improvement experiment v3

The owner selected improving agent quality after publication of v0.1.0. The original CPU model result remains 0 acceptable proposals from 16 registered attempts. Version three does not rewrite that result or the scripted baseline.

Initial hypothesis: the textual /no_think instruction did not reliably turn off reasoning in the compatible API. The pinned Ollama v0.40.13 source, openai/openai.go, maps reasoning_effort none to Think false and gives a nested reasoning field precedence. The experiment therefore removes a nested reasoning field and sends reasoning_effort none. The model, original instructions, three tool schemas, validator, four model-call/six tool-call limits, output bound and case deadline initially remain the same. Safe call-settled metadata distinguishes a failed call from one that actually executed. Traces never copy reasoning text or raw error text.

Sources: https://github.com/ollama/ollama/blob/v0.40.13/openai/openai.go and the documentation bundled with eve 1.0.0-rc.1. The official Linux Ollama archive is pinned by SHA-256 in the experiment workflow. The model digest is checked after download, and each graded attempt verifies CPU placement and context allocation.

Development starts with one declared damaged-delivery case in eval/plans/model-experiment-v3.json. The harness refuses development IDs belonging to the held-out split. There are no held-out IDs or frozen v3 configuration initially, so held-out inference is disabled. Additional development cases and configuration changes must be committed, and every failed attempt retained. A final operating point and evaluation scope must be frozen before a new scored run.

The runtime environment differs from the original Windows CPU/direct-Neon run: GitHub Actions uses a Linux CPU and a disposable local PostgreSQL instance. Quality comparisons must disclose those changes and must not attribute all differences to a single parameter. Inference remains actual local open-model execution inside the runner, with no hosted model key, payment provider or message sender.

The workflow runs only on the agent-quality-v3 branch. It does not redeploy the released application. Runner success is infrastructure evidence; only independent grading of a stored proposal can count as model correctness. The public workbench should adopt new results only after the declared evaluation completes with full provenance.
