# Handoff

Build a bounded support workflow for Sample Supply. All records are synthetic. All refunds and messages are simulated. Never connect a payment or messaging provider.

Run npm run check and the targeted Node tests after changing domain code. Run npm run test:integration against a disposable Handoff database after changing persistence. Run npm run test:browser after changing the workbench. Run npm run verify before preparing a release.

The runtime reads packages/fixtures/data. Evaluator truth lives only under eval/truth. Never import truth from application or agent code. Exactly three model tools are permitted: get_order_facts, find_policy_clauses, propose_resolution. Models cannot approve or execute.

Use integer USD cents. Approval binds the proposal digest and business versions. Commit effects, balances, events and receipts in one transaction. Recover completed effects before rechecking expired approval. Use compound session keys and explicit handoff schema qualification.

Report scripted, local-model and recorded evidence separately. Missing evidence is not a passing result. Preserve failed attempts. Generated claims require valid provenance. Keep credentials, weights and capability values out of tracked files and logs.

Use the existing prompt as the acceptance contract. No public publication or full-completion tag without the required evidence and authorization. No unrelated project changes.
