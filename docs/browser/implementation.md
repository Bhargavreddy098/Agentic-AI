---
title: "Browser and computer runtime implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F18"
updated: "2026-11-05"
---

# Browser and computer runtime implementation guide

## Order and prerequisites

Primary phase IP12. Read [contracts](contracts.md), [mechanism](browser-sessions.md), direct peers ([tools](../tools/index.md), [approvals](../approvals/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F18-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F18-B | Replace synthetic completed browser logs with unavailable state first; later real bounded browser adapter | Unconfigured browser cannot claim success; denied sensitive action causes no effect; profile and child resources cleaned. |
| F18-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F18-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Create bounded isolated browser profiles; navigation/read versus upload/download/account changes have different permissions. Page content is untrusted. Actual browser observations produce evidence; absence of adapter returns unavailable. Computer control needs separate narrow targeting.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
