---
title: "CLI and headless consumers implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F24"
updated: "2026-11-05"
---

# CLI and headless consumers implementation guide

## Order and prerequisites

Primary phase IP09. Read [contracts](contracts.md), [mechanism](headless-commands.md), direct peers ([gateway](../gateway/index.md), [security](../security/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F24-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F24-B | Current status/read-only TUI only; add authenticated project/session/run commands using same gateway | Same operation via CLI/UI yields same state; SIGINT cancels; missing authority exits safely without mutations. |
| F24-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F24-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

CLI parses explicit arguments, authenticates and calls the same API as UI. It owns no direct database or privileged execution route. Noninteractive operation cannot auto-approve effects. Stable JSON output and exit codes distinguish denied, unavailable and failed.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
