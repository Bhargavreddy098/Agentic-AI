---
title: "Model providers verification"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F04"
updated: "2026-11-05"
---

# Model providers verification

All scenarios are **NOT RUN**; this page specifies future tests.

| Scenario | Action | Required observation |
|---|---|---|
| F04-T01 normal | Exercise the real domain path | 401/429/timeout/interrupted stream normalize correctly; real authorized inference and immediate lease reacquisition; real UI/CLI journey where applicable and source-bound evidence. |
| F04-T02 boundary | Real authorized model response; 401/429/timeout/stream truncation controls; cancellation releases lease. | Domain invariant holds; forbidden effects absent |
| F04-T03 identity | Wrong workspace/principal or forged authority | Rejected before state disclosure or mutation |
| F04-T04 prerequisite | Make a required dependency unavailable | Explicit blocked/unavailable; no synthetic success |
| F04-T05 restart | Cancel or kill around persistence/effect boundary | No duplicate confirmed mutation; unknown result reconciled |
| F04-T06 consumer | Trigger from UI/CLI and reconnect | Truthful state restored without resubmitting mutation |

## Test layers

Unit: deterministic validators/state transitions. Contract: schemas/errors/events. Integration: real isolated SQLite and actual service dispatch. E2E: consuming interface and real relevant provider/guest/adapter. Controlled doubles support failure injection but do not replace real feature acceptance.

## Evidence

Record requirement, source revision, command, isolated target, tested boundary, actual outcome and sanitized artifact. Missing required checks yield UNKNOWN. No paid provider calls, guest activation, database conversion or deployment without separate approval. See [testing rules](../help/testing/index.md).
