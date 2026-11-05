---
title: "Model providers troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F04"
updated: "2026-11-05"
---

# Model providers troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: Adapters preserve exact model identifiers and normalize text, tools, usage and terminal outcomes. Abort flows from user request through coordinator to upstream. Partial output is stored as interrupted; a new provider cannot silently replay already executed effects.

Reproduce this scenario for diagnosis: Real authorized model response; 401/429/timeout/stream truncation controls; cancellation releases lease.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
