---
title: "Verification and quality implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F15"
updated: "2026-11-05"
---

# Verification and quality implementation guide

## Order and prerequisites

Primary phase IP06. Read [contracts](contracts.md), [mechanism](evidence-and-verdicts.md), direct peers ([planning](../planning/index.md), [tools](../tools/index.md), [workspace](../workspace/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F15-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F15-B | Remove no-results default pass behavior; obtain trusted checker receipts and bind verdict to artifact/contract | Delete required receipt, substitute artifact digest and induce checker failure; no case produces PASS. |
| F15-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F15-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Only trusted checker execution can certify a criterion. Bind receipt to artifact, environment and approved criterion revision. Missing required checks yield UNKNOWN. Producer-provided pass strings and synthetic logs are not evidence. Bounded repair must rerun affected checks.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
