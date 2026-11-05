---
title: "Workspace Git and artifacts troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F11"
updated: "2026-11-05"
---

# Workspace Git and artifacts troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: Resolve canonical root and target including Windows junctions. Preview changes against a base digest; approval binds that preview. At application recheck target and digest. Preserve user edits on conflict; record resulting artifact digest. Git commit/push are separate effects.

Reproduce this scenario for diagnosis: Cross-drive/junction escapes fail; modify base after preview and confirm refusal without overwriting unrelated edits.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
