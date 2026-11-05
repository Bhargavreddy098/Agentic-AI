---
title: "MCP and code intelligence verification"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F13"
updated: "2026-11-05"
---

# MCP and code intelligence verification

All scenarios are **NOT RUN**; this page specifies future tests.

| Scenario | Action | Required observation |
|---|---|---|
| F13-T01 normal | Exercise the real domain path | Unauthorized server/tool rejected; parser cancellation works; bounded outputs; real guest search and diagnostics; real UI/CLI journey where applicable and source-bound evidence. |
| F13-T02 boundary | Unauthorized server/tool rejected; real ripgrep and Tree-sitter results; malformed/oversized response bounded. | Domain invariant holds; forbidden effects absent |
| F13-T03 identity | Wrong workspace/principal or forged authority | Rejected before state disclosure or mutation |
| F13-T04 prerequisite | Make a required dependency unavailable | Explicit blocked/unavailable; no synthetic success |
| F13-T05 restart | Cancel or kill around persistence/effect boundary | No duplicate confirmed mutation; unknown result reconciled |
| F13-T06 consumer | Trigger from UI/CLI and reconnect | Truthful state restored without resubmitting mutation |

## Test layers

Unit: deterministic validators/state transitions. Contract: schemas/errors/events. Integration: real isolated SQLite and actual service dispatch. E2E: consuming interface and real relevant provider/guest/adapter. Controlled doubles support failure injection but do not replace real feature acceptance.

## Evidence

Record requirement, source revision, command, isolated target, tested boundary, actual outcome and sanitized artifact. Missing required checks yield UNKNOWN. No paid provider calls, guest activation, database conversion or deployment without separate approval. See [testing rules](../help/testing/index.md).
