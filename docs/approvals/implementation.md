---
title: "Approvals and governance implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F08"
updated: "2026-11-05"
---

# Approvals and governance implementation guide

## Order and prerequisites

Primary phase IP04. Read [contracts](contracts.md), [mechanism](action-approval.md), direct peers ([security](../security/index.md), [sessions](../sessions/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F08-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F08-B | Server-classified risk and exact action proofs; preserve legacy mode wire values with explicit four-mode mapping proposal | Spoof risk/actor, alter target after approval, replay proof and revoke authority; deny before any effect. |
| F08-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F08-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Classify risk in trusted code, bind permission to exact action/target/input digest and current principal. Pending, approved, rejected, expired and consumed are distinct. Approval display is derived from the same descriptor used by execution.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
