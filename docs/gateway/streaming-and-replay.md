---
title: "Gateway and transport — streaming and replay"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F01"
updated: "2026-11-05"
---

# Gateway and transport — streaming and replay

## How it works

Persist run events with monotonically increasing sequence under the execution owner. A reconnect supplies the last observed cursor; server validates scope and retained history. If history expired, return explicit resynchronization rather than inventing events. Slow consumers are bounded and disconnected safely.

## Integration

[security](../security/index.md), [sessions](../sessions/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Reconnect after token/tool events; no duplicated mutation or missing terminal outcome.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
