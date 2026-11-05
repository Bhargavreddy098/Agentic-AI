---
title: "Release backup and recovery troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F21"
updated: "2026-11-05"
---

# Release backup and recovery troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: A qualified backup is consistent and integrity checked; restore is rehearsed into an isolated destination. Single-file conversion preserves originals. Updates retain compatible recovery paths; after new target writes, rollback cannot simply point at stale old data.

Reproduce this scenario for diagnosis: Restore actual backup into fresh fixture; corrupt backup refused; restored application state matches invariants.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
