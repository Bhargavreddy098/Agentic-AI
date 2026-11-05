---
title: "External worker adapters implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F16"
updated: "2026-11-05"
---

# External worker adapters implementation guide

## Order and prerequisites

Primary phase IP12. Read [contracts](contracts.md), [mechanism](worker-protocol.md), direct peers ([runtime](../runtime/index.md), [tools](../tools/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F16-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F16-B | Existing internal worker is not proof of external IDE integration; qualify one selected adapter later | Disconnect during effect, resume and reconcile; worker cannot expand scope or silently spawn nested authority. |
| F16-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F16-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

External worker receives parent task identity, bounded root/effects, budget and deadline. Adapter reports progress/receipts but cannot own another independent run authority. Qualify one selected adapter before supporting additional tools.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
