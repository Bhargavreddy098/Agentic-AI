---
title: "Desktop shell and security troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F22"
updated: "2026-11-05"
---

# Desktop shell and security troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: Electron main owns native capabilities; preload is a narrow typed allowlist. Authenticate sender origin/frame before action. Renderer never receives generic shell/fs or decryption. Backend startup/readiness and window lifecycle expose truthful states.

Reproduce this scenario for diagnosis: Forged sender denied; restart restores session; stopped backend shows unavailable; owned processes cleaned.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
