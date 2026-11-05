---
title: "Frontend product surfaces implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F23"
updated: "2026-11-05"
---

# Frontend product surfaces implementation guide

## Order and prerequisites

Primary phase IP09. Read [contracts](contracts.md), [mechanism](workspace-surfaces.md), direct peers ([gateway](../gateway/index.md), [runtime](../runtime/index.md), [workspace](../workspace/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F23-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F23-B | Active UI is compact chat; client wrappers do not establish IDE views; add editor/terminal/plans/approvals/monitoring within approved design | No hardcoded provider/workspace success; reconnect restores state without dispatching twice; keyboard/accessibility flows work. |
| F23-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F23-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

React owns drafts/tabs and renders canonical server state. Editor, diff, terminal, plan, approvals and monitoring use actual APIs. Use Zustand for client state and TanStack Query for server cache where justified; React Flow projects recorded tasks. Preserve compact design.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
