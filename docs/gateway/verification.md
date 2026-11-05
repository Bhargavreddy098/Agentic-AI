---
title: "Gateway and transport verification"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F01"
updated: "2026-11-05"
---

# Gateway and transport verification

All scenarios are **NOT RUN**; this page specifies future tests.

| Scenario | Action | Required observation |
|---|---|---|
| F01-T01 normal | Exercise the real domain path | Reject forged origins and cross-workspace reads; replay ordered events once after disconnect; real UI/CLI journey where applicable and source-bound evidence. |
| F01-T02 boundary | Reconnect after token/tool events; no duplicated mutation or missing terminal outcome. | Domain invariant holds; forbidden effects absent |
| F01-T03 identity | Wrong workspace/principal or forged authority | Rejected before state disclosure or mutation |
| F01-T04 prerequisite | Make a required dependency unavailable | Explicit blocked/unavailable; no synthetic success |
| F01-T05 restart | Cancel or kill around persistence/effect boundary | No duplicate confirmed mutation; unknown result reconciled |
| F01-T06 consumer | Trigger from UI/CLI and reconnect | Truthful state restored without resubmitting mutation |

## Test layers

Unit: deterministic validators/state transitions. Contract: schemas/errors/events. Integration: real isolated SQLite and actual service dispatch. E2E: consuming interface and real relevant provider/guest/adapter. Controlled doubles support failure injection but do not replace real feature acceptance.

## Evidence

Record requirement, source revision, command, isolated target, tested boundary, actual outcome and sanitized artifact. Missing required checks yield UNKNOWN. No paid provider calls, guest activation, database conversion or deployment without separate approval. See [testing rules](../help/testing/index.md).
