---
title: "Workspace Git and artifacts implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F11"
updated: "2026-11-05"
---

# Workspace Git and artifacts implementation guide

## Order and prerequisites

Primary phase IP04. Read [contracts](contracts.md), [mechanism](patch-application.md), direct peers ([security](../security/index.md), [approvals](../approvals/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F11-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F11-B | Canonical roots, bounded reads, digest-bound previews and atomic patches; Git status/diff without auto commit/push | Cross-drive/junction escapes fail; modify base after preview and confirm refusal without overwriting unrelated edits. |
| F11-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F11-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Resolve canonical root and target including Windows junctions. Preview changes against a base digest; approval binds that preview. At application recheck target and digest. Preserve user edits on conflict; record resulting artifact digest. Git commit/push are separate effects.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
