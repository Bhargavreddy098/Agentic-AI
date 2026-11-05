---
title: "Release backup and recovery implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F21"
updated: "2026-11-05"
---

# Release backup and recovery implementation guide

## Order and prerequisites

Primary phase IP10. Read [contracts](contracts.md), [mechanism](backup-and-restore.md), direct peers ([sessions](../sessions/index.md), [desktop](../desktop/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F21-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F21-B | Backup/restore currently unavailable; implement consistent single-file backup, isolated restore and packaging qualification | Restore actual backup into fresh fixture; corrupt backup refused; restored application state matches invariants. |
| F21-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F21-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

A qualified backup is consistent and integrity checked; restore is rehearsed into an isolated destination. Single-file conversion preserves originals. Updates retain compatible recovery paths; after new target writes, rollback cannot simply point at stale old data.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
