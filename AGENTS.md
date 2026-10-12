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

Every completed development slice MUST update both the repository progress and
the published design Site progress in the same iteration. The authority is
docs/progress.json on codex/phase-one-foundation. Update the concrete delivery
checkbox, affected task/requirement notes, validation, capability map and handover;
then run scripts/sync-design-progress.mjs against the existing Site checkout,
publish the same Site, and run npm run progress:verify against its live URL.
Verify the page snapshot and all three downloads, and save the publication
receipt in docs/progress-sync.json. A code change alone is not a completed
two-location sync. If publishing is blocked, report the exact remaining mismatch
and retain the pending sync; never claim both locations are current. Do not mark
whole tasks accepted from a development slice or add a fake business delivery
for documentation-only synchronization.
