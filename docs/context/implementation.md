---
title: "Context memory and skills implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F14"
updated: "2026-11-05"
---

# Context memory and skills implementation guide

## Order and prerequisites

Primary phase IP07. Read [contracts](contracts.md), [mechanism](context-and-memory.md), direct peers ([sessions](../sessions/index.md), [workspace](../workspace/index.md), [code-intelligence](../code-intelligence/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F14-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F14-B | Scoped retrieval with provenance/freshness/token budget; document skill loading trust before enabling it | Cross-project facts excluded; removed memory not reused; prompt injection cannot grant tools; context respects budget. |
| F14-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F14-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Assemble deterministic bounded context from authorized history, project facts and attributed memory. Rank within model budget; record omissions. Memory can be corrected/deleted and scoped to user/project. Retrieved skills and repository text cannot override policy.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
