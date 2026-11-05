---
title: "Approvals and governance verification"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F08"
updated: "2026-11-05"
---

# Approvals and governance verification

All scenarios are **NOT RUN**; this page specifies future tests.

| Scenario | Action | Required observation |
|---|---|---|
| F08-T01 normal | Exercise the real domain path | Spoofed actor/risk, expired/replayed grant and changed action digest are denied before dispatch; real UI/CLI journey where applicable and source-bound evidence. |
| F08-T02 boundary | Spoof risk/actor, alter target after approval, replay proof and revoke authority; deny before any effect. | Domain invariant holds; forbidden effects absent |
| F08-T03 identity | Wrong workspace/principal or forged authority | Rejected before state disclosure or mutation |
| F08-T04 prerequisite | Make a required dependency unavailable | Explicit blocked/unavailable; no synthetic success |
| F08-T05 restart | Cancel or kill around persistence/effect boundary | No duplicate confirmed mutation; unknown result reconciled |
| F08-T06 consumer | Trigger from UI/CLI and reconnect | Truthful state restored without resubmitting mutation |

## Test layers

Unit: deterministic validators/state transitions. Contract: schemas/errors/events. Integration: real isolated SQLite and actual service dispatch. E2E: consuming interface and real relevant provider/guest/adapter. Controlled doubles support failure injection but do not replace real feature acceptance.

## Evidence

Record requirement, source revision, command, isolated target, tested boundary, actual outcome and sanitized artifact. Missing required checks yield UNKNOWN. No paid provider calls, guest activation, database conversion or deployment without separate approval. See [testing rules](../help/testing/index.md).
