# Optical Workbench

Latest user direction (2026-10-18): pause ongoing business development and keep
the four-hour automation disabled until the user asks to resume. Only the
requested static preview/publication work is authorized now. The user explicitly
authorized merging the current work into main; older keep-draft/no-merge notes
describe the previous development policy and do not block this release.

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
docs/progress.json on main. Update the concrete delivery
checkbox, affected task/requirement notes, validation, capability map and handover;
then run scripts/sync-design-progress.mjs against the existing Site checkout,
publish the same Site, and run npm run progress:verify against its live URL.
Verify the page snapshot and all three downloads, and save the publication
receipt in docs/progress-sync.json. A code change alone is not a completed
two-location sync. If publishing is blocked, report the exact remaining mismatch
and retain the pending sync; never claim both locations are current. Do not mark
whole tasks accepted from a development slice or add a fake business delivery
for documentation-only synchronization.

User authorization (2026-10-12): continue the documented workflow step by step
without waiting for another notification after each slice. Push code and finish
the required repository/Site progress publication for every verified slice.
Continue independent work around unresolved real-business rules; never invent
the rules or claim pending business acceptance. Record the next entry on pauses.

If GitHub CLI credentials expire, use the connected GitHub tools for reads and
writes; do not start an interactive login or extract credentials. Create text
blobs with explicit encoding="utf-8" and verify their Git blob hashes against
local bytes before building a tree. Never submit UTF-8 text as base64 content.
Re-read the branch head before updating its ref, use its exact expected SHA,
and preserve concurrent commits; do not force an outdated head. Verify the
remote ref and exact tree after the write. All current Markdown and JSON must
round-trip through strict UTF-8. If an older binary/corrupt documentation blob
cannot be fetched through a text-only tool, retain its server history and
record its SHA/recovery entry rather than replacing history or claiming the
old object was recovered. Keep the latest handover and progress readable.

Publication receipts must come from a successful verification of the current
progress SHA and all three current downloads after the actual deployment time.
Never enrich or reuse an older passed receipt just because its version matches,
especially after a documentation-only repair.

When recording a slice, align the handover's current-version header and the
remaining-work headline/counts with docs/progress.json. Preserve old sections
as history; do not restore a stale current-version header from an older file.
