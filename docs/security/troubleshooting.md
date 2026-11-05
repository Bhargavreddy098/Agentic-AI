---
title: "Identity security and credentials troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F02"
updated: "2026-11-05"
---

# Identity security and credentials troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: Electron main accepts one-time credential input through trusted IPC, encrypts with safeStorage and stores an opaque reference. Provider resolution occurs inside trusted processes. Rotation creates a new credential revision; in-flight behavior is explicit and revocation blocks new dispatch.

Reproduce this scenario for diagnosis: Reject forged IPC, unavailable encryption and revoked references; scan renderer/log artifacts for secret canaries.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
