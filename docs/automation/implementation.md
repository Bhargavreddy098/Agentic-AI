---
title: "Scheduling events notifications implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F17"
updated: "2026-11-05"
---

# Scheduling events notifications implementation guide

## Order and prerequisites

Primary phase IP11. Read [contracts](contracts.md), [mechanism](scheduler-admission.md), direct peers ([runtime](../runtime/index.md), [approvals](../approvals/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F17-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F17-B | Atomic SQLite occurrence admission and real canonical run dispatch; policy checks; local delivery outbox | Concurrent pollers admit one logical run; duplicate event and notification retry do not repeat changes. |
| F17-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F17-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Atomically admit unique schedule/instant occurrence, rechecking current authority. Scheduler invokes canonical runtime rather than another agent loop. Retry delivery independently of execution. Specify overlap/misfire/timezone behavior explicitly.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
