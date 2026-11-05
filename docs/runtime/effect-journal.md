---
title: "Runtime and durable recovery — effect journal"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F09"
updated: "2026-11-05"
---

# Runtime and durable recovery — effect journal

## How it works

Assign stable operation identity before dispatch. Persist intent and actual receipt under fenced run ownership. Recovery distinguishes not-started, confirmed-completed, failed and uncertain. Unknown effects require reconciliation; there is no blanket exactly-once guarantee for external actions.

## Integration

[planning](../planning/index.md), [providers](../providers/index.md), [tools](../tools/index.md), [verification](../verification/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Kill before/after mutation and receipt persistence; resume cannot duplicate confirmed effect or blindly retry uncertainty.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
