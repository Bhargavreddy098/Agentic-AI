---
title: "Observability and evaluations implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F20"
updated: "2026-11-05"
---

# Observability and evaluations implementation guide

## Order and prerequisites

Primary phase IP01. Read [contracts](contracts.md), [mechanism](correlation-and-redaction.md), direct peers ([sessions](../sessions/index.md), [runtime](../runtime/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F20-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F20-B | Correlate run/effect/model events, redact secrets and replace unconditional health/security claims with measurements | Inject secret canaries and missing probes; no leakage or fabricated healthy/security flags. |
| F20-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F20-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Correlate request/run/effect/model activity without secret payloads. Derive costs from actual usage and diagnostics from real probes. Unknown is distinct from healthy. Retention and exported diagnostics are explicit and scoped.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
