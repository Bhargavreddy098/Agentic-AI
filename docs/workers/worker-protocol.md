---
title: "External worker adapters — worker protocol"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F16"
updated: "2026-11-05"
---

# External worker adapters — worker protocol

## How it works

External worker receives parent task identity, bounded root/effects, budget and deadline. Adapter reports progress/receipts but cannot own another independent run authority. Qualify one selected adapter before supporting additional tools.

## Integration

[runtime](../runtime/index.md), [tools](../tools/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Disconnect during effect, resume and reconcile; worker cannot expand scope or silently spawn nested authority.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
