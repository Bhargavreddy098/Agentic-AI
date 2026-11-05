---
title: "Frontend product surfaces verification"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F23"
updated: "2026-11-05"
---

# Frontend product surfaces verification

All scenarios are **NOT RUN**; this page specifies future tests.

| Scenario | Action | Required observation |
|---|---|---|
| F23-T01 normal | Exercise the real domain path | Every visible action hits canonical API; offline/loading/empty/error/cancel states; no hardcoded workspace/model treated as real; real UI/CLI journey where applicable and source-bound evidence. |
| F23-T02 boundary | No hardcoded provider/workspace success; reconnect restores state without dispatching twice; keyboard/accessibility flows work. | Domain invariant holds; forbidden effects absent |
| F23-T03 identity | Wrong workspace/principal or forged authority | Rejected before state disclosure or mutation |
| F23-T04 prerequisite | Make a required dependency unavailable | Explicit blocked/unavailable; no synthetic success |
| F23-T05 restart | Cancel or kill around persistence/effect boundary | No duplicate confirmed mutation; unknown result reconciled |
| F23-T06 consumer | Trigger from UI/CLI and reconnect | Truthful state restored without resubmitting mutation |

## Test layers

Unit: deterministic validators/state transitions. Contract: schemas/errors/events. Integration: real isolated SQLite and actual service dispatch. E2E: consuming interface and real relevant provider/guest/adapter. Controlled doubles support failure injection but do not replace real feature acceptance.

## Evidence

Record requirement, source revision, command, isolated target, tested boundary, actual outcome and sanitized artifact. Missing required checks yield UNKNOWN. No paid provider calls, guest activation, database conversion or deployment without separate approval. See [testing rules](../help/testing/index.md).
