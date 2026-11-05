---
title: "Intent research and requirements implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F06"
updated: "2026-11-05"
---

# Intent research and requirements implementation guide

## Order and prerequisites

Primary phase IP05. Read [contracts](contracts.md), [mechanism](research-provenance.md), direct peers ([providers](../providers/index.md), [sessions](../sessions/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F06-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F06-B | Replace confirmed empty stub after caller audit; persist clarification/provenance and measurable requirements | Ambiguous scope triggers clarification; conflicting sources remain explicit; requirement revisions survive restart. |
| F06-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F06-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Capture goals, constraints and non-goals; ask only consequential unresolved questions. Record research source, retrieval time and confidence separately from user instructions. Turn claims into measurable requirements with stable IDs. External content never grants permissions.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
