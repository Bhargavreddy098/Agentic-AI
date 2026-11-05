---
title: "Specialists and independent review troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F10"
updated: "2026-11-05"
---

# Specialists and independent review troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: Parent may delegate repeatedly but specialists cannot delegate. Durable admission allows at most three concurrent specialists. Each receives bounded scope/context and returns attributed artifacts. Independent review checks fixed artifact digest; it cannot widen parent permissions.

Reproduce this scenario for diagnosis: Fourth concurrent request rejected; sequential reuse works; nested delegation denied; stale artifact review rejected.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
