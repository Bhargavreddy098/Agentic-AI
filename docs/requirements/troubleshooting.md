---
title: "Intent research and requirements troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F06"
updated: "2026-11-05"
---

# Intent research and requirements troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: Capture goals, constraints and non-goals; ask only consequential unresolved questions. Record research source, retrieval time and confidence separately from user instructions. Turn claims into measurable requirements with stable IDs. External content never grants permissions.

Reproduce this scenario for diagnosis: Ambiguous scope triggers clarification; conflicting sources remain explicit; requirement revisions survive restart.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
