---
title: "Context memory and skills troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F14"
updated: "2026-11-05"
---

# Context memory and skills troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: Assemble deterministic bounded context from authorized history, project facts and attributed memory. Rank within model budget; record omissions. Memory can be corrected/deleted and scoped to user/project. Retrieved skills and repository text cannot override policy.

Reproduce this scenario for diagnosis: Cross-project facts excluded; removed memory not reused; prompt injection cannot grant tools; context respects budget.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
