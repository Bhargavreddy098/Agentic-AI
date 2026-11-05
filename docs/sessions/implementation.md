---
title: "Sessions and persistence implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F03"
updated: "2026-11-05"
---

# Sessions and persistence implementation guide

## Order and prerequisites

Primary phase IP01. Read [contracts](contracts.md), [mechanism](sqlite-transactions.md), direct peers ([security](../security/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F03-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F03-B | Replace swallowed transaction-control failures; plan single-file conversion and isolated test paths | Concurrent writes, rollback, disk-full and process death never yield false committed success. |
| F03-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F03-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

One SQLite owner serializes writes. Never swallow BEGIN or COMMIT failure. Async callbacks may not interleave inside another request transaction. Tests set an isolated root before importing persistence. Attached databases remain current-source history, not the desired architecture.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
