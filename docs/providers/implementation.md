---
title: "Model providers implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F04"
updated: "2026-11-05"
---

# Model providers implementation guide

## Order and prerequisites

Primary phase IP03. Read [contracts](contracts.md), [mechanism](streaming-and-cancellation.md), direct peers ([security](../security/index.md), [routing](../routing/index.md), [sessions](../sessions/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F04-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F04-B | Preserve exact IDs, native chat, discovery, provider port, tool compatibility, streaming and cancellation | Real authorized model response; 401/429/timeout/stream truncation controls; cancellation releases lease. |
| F04-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F04-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Adapters preserve exact model identifiers and normalize text, tools, usage and terminal outcomes. Abort flows from user request through coordinator to upstream. Partial output is stored as interrupted; a new provider cannot silently replay already executed effects.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
