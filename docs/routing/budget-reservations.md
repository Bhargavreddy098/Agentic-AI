---
title: "Routing and budgets — budget reservations"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F05"
updated: "2026-11-05"
---

# Routing and budgets — budget reservations

## How it works

Before inference reserve a bounded budget against eligible routes. Settle reported usage once using durable operation identity. Unreported usage is unknown, not zero. Failed or cancelled requests reconcile reservation state. Fallback must satisfy capabilities and remaining authority.

## Integration

[providers](../providers/index.md), [approvals](../approvals/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Race two reservations, cancel an active request and repeat settlement; no double debit or unauthorized spend.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
