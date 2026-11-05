---
title: "Specialists and independent review — delegation and review"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F10"
updated: "2026-11-05"
---

# Specialists and independent review — delegation and review

## How it works

Parent may delegate repeatedly but specialists cannot delegate. Durable admission allows at most three concurrent specialists. Each receives bounded scope/context and returns attributed artifacts. Independent review checks fixed artifact digest; it cannot widen parent permissions.

## Integration

[runtime](../runtime/index.md), [context](../context/index.md), [verification](../verification/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Fourth concurrent request rejected; sequential reuse works; nested delegation denied; stale artifact review rejected.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
