---
title: "Desktop shell and security implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F22"
updated: "2026-11-05"
---

# Desktop shell and security implementation guide

## Order and prerequisites

Primary phase IP02. Read [contracts](contracts.md), [mechanism](ipc-contracts.md), direct peers ([security](../security/index.md), [gateway](../gateway/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F22-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F22-B | Preserve window.sirona bridge; qualify readiness, trusted senders, startup/shutdown and restart | Forged sender denied; restart restores session; stopped backend shows unavailable; owned processes cleaned. |
| F22-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F22-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Electron main owns native capabilities; preload is a narrow typed allowlist. Authenticate sender origin/frame before action. Renderer never receives generic shell/fs or decryption. Backend startup/readiness and window lifecycle expose truthful states.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
