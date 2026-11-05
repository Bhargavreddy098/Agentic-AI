---
title: "Deployment and integrations implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F19"
updated: "2026-11-05"
---

# Deployment and integrations implementation guide

## Order and prerequisites

Primary phase IP13. Read [contracts](contracts.md), [mechanism](health-and-rollback.md), direct peers ([verification](../verification/index.md), [approvals](../approvals/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F19-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F19-B | Replace synthetic active/healthy result paths with fail-closed availability; qualify one approved target later | Changed artifact invalidates approval; real health probes required; failed deployment follows tested target rollback. |
| F19-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F19-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Preview pins artifact, environment, target and rollback strategy. Separate approval authorizes deployment. Record real external release identity and measured health; reconcile uncertain outcome before retry. Target selection is a prerequisite, not an arbitrary adapter choice.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
