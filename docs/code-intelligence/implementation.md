---
title: "MCP and code intelligence implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F13"
updated: "2026-11-05"
---

# MCP and code intelligence implementation guide

## Order and prerequisites

Primary phase IP07. Read [contracts](contracts.md), [mechanism](mcp-and-parsing.md), direct peers ([tools](../tools/index.md), [workspace](../workspace/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F13-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F13-B | Authorize actual MCP dispatch; qualify guest ripgrep, Tree-sitter and LSP using pinned artifacts | Unauthorized server/tool rejected; real ripgrep and Tree-sitter results; malformed/oversized response bounded. |
| F13-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F13-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

MCP discovery returns capability descriptions but grants no execution authority. Validate tool schemas and responses, scope server registration, bound output and cancellation. Search/parsing indexes are tied to project revision; stale results are identified.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
