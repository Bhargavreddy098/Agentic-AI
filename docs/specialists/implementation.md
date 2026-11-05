---
title: "Specialists and independent review implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F10"
updated: "2026-11-05"
---

# Specialists and independent review implementation guide

## Order and prerequisites

Primary phase IP08. Read [contracts](contracts.md), [mechanism](delegation-and-review.md), direct peers ([runtime](../runtime/index.md), [context](../context/index.md), [verification](../verification/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F10-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F10-B | Qualify flat parent delegation, max three concurrent specialists, independent artifact review and bounded repair | Fourth concurrent request rejected; sequential reuse works; nested delegation denied; stale artifact review rejected. |
| F10-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F10-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Parent may delegate repeatedly but specialists cannot delegate. Durable admission allows at most three concurrent specialists. Each receives bounded scope/context and returns attributed artifacts. Independent review checks fixed artifact digest; it cannot widen parent permissions.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
