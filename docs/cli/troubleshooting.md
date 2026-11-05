---
title: "CLI and headless consumers troubleshooting"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F24"
updated: "2026-11-05"
---

# CLI and headless consumers troubleshooting

| Symptom | Inspect | Safe response |
|---|---|---|
| Denied request | Principal, workspace and current policy | Correct scope; never disable enforcement |
| Pending indefinitely | Actual lifecycle, approval and dependency readiness | Show blocker; cancel explicitly if requested |
| Inconsistent output | Operation identity, revision and receipt | Reconcile before retry |
| Consumer stale | Durable query and event cursor | Refresh projection without repeating effect |
| Unavailable feature | Qualification and configuration | Report unavailable; never manufacture success |

Domain-specific invariant: CLI parses explicit arguments, authenticates and calls the same API as UI. It owns no direct database or privileged execution route. Noninteractive operation cannot auto-approve effects. Stable JSON output and exit codes distinguish denied, unavailable and failed.

Reproduce this scenario for diagnosis: Same operation via CLI/UI yields same state; SIGINT cancels; missing authority exits safely without mutations.

Use correlation IDs and redacted logs. Never request API keys in chat or export secret-bearing database rows. When effect outcome is uncertain, preserve evidence and request an exact recovery decision if read-only reconciliation cannot resolve it.
