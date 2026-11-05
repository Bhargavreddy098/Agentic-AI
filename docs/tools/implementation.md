---
title: "Tool runtime and sandbox implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F12"
updated: "2026-11-05"
---

# Tool runtime and sandbox implementation guide

## Order and prerequisites

Primary phase IP04. Read [contracts](contracts.md), [mechanism](guest-execution.md), direct peers ([workspace](../workspace/index.md), [approvals](../approvals/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F12-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F12-B | Qualify exact trusted-local guest; reconcile explicit host opt-in with policy; enforce receipts, bounds and cleanup | Docker outage never selects host fallback; verify network/resource bounds, timeout cleanup and actual receipt. |
| F12-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F12-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Project commands use the qualified Docker Desktop/WSL2 trusted-local profile. WSL2 is the substrate, not authorization for arbitrary host or distro commands. Enforce bounded filesystem export/mount policy, network rules, resource limits and process cleanup. Timeout is not a sandbox.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
