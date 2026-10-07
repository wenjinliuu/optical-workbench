# Optical Workbench

Read docs/phase-one.md, docs/progress.json, docs/handover.md and
docs/capability-map.md before editing.
Keep original V1.1 task and requirement identifiers. Implementation and business
acceptance are separate. Never mark a whole task complete from a partial slice.
Use synthetic records only. Do not invent deduction, refund, professional form,
financial reporting or external integration rules. Enforce scope on the server.
Run npm run check and npm test for changes to shared data or authorization.
This repository is a local development system until the production architecture,
identity, backup and data protection decisions are confirmed.

Preserve shared customer/cycle/visit identities across workflows. Capture immutable
version references for historical execution/visits and include new data in recovery
checks and the customer timeline. The user defers hands-on testing; continue developer
verification and keep business acceptance pending. Update the capability map each iteration.
