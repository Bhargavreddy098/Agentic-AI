---
title: "Gateway and transport troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F01"
updated: "2026-11-05"
---

# Gateway and transport troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: Persist run events with monotonically increasing sequence under the execution owner. A reconnect supplies the last observed cursor; server validates scope and retained history. If history expired, return explicit resynchronization rather than inventing events. Slow consumers are bounded and disconnected safely.

Reproduce this scenario for diagnosis: Reconnect after token/tool events; no duplicated mutation or missing terminal outcome.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
