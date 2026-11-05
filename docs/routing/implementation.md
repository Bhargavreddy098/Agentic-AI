---
title: "Routing and budgets implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F05"
updated: "2026-11-05"
---

# Routing and budgets implementation guide

## Order and prerequisites

Primary phase IP03. Read [contracts](contracts.md), [mechanism](budget-reservations.md), direct peers ([providers](../providers/index.md), [approvals](../approvals/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F05-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F05-B | Unify capability eligibility and budget reservation/settlement; forbid replay after partial side effects | Race two reservations, cancel an active request and repeat settlement; no double debit or unauthorized spend. |
| F05-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F05-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Before inference reserve a bounded budget against eligible routes. Settle reported usage once using durable operation identity. Unreported usage is unknown, not zero. Failed or cancelled requests reconcile reservation state. Fallback must satisfy capabilities and remaining authority.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
