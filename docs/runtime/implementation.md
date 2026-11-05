---
title: "Runtime and durable recovery implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F09"
updated: "2026-11-05"
---

# Runtime and durable recovery implementation guide

## Order and prerequisites

Primary phase IP06. Read [contracts](contracts.md), [mechanism](effect-journal.md), direct peers ([planning](../planning/index.md), [providers](../providers/index.md), [tools](../tools/index.md), [verification](../verification/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F09-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F09-B | One run authority; fencing, stable operation keys, cancellation, reconciliation and version-pinned resume | Kill before/after mutation and receipt persistence; resume cannot duplicate confirmed effect or blindly retry uncertainty. |
| F09-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F09-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Assign stable operation identity before dispatch. Persist intent and actual receipt under fenced run ownership. Recovery distinguishes not-started, confirmed-completed, failed and uncertain. Unknown effects require reconciliation; there is no blanket exactly-once guarantee for external actions.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
