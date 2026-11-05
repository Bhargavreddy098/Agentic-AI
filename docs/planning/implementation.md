---
title: "Planning and Build Contracts implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F07"
updated: "2026-11-05"
---

# Planning and Build Contracts implementation guide

## Order and prerequisites

Primary phase IP05. Read [contracts](contracts.md), [mechanism](build-contracts.md), direct peers ([requirements](../requirements/index.md), [approvals](../approvals/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F07-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F07-B | Bind task DAG, requirement revision, budget, allowed effects and acceptance to immutable approved contract | Modify an approved plan and confirm new approval is required; Plan Only never dispatches a file write. |
| F07-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F07-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

A Build Contract pins requirement revision, plan DAG, workspace, effects, budgets and acceptance criteria. Approval attaches to its digest/revision. New scope produces a new revision; old approval cannot authorize it. Reject dependency cycles before run admission.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
