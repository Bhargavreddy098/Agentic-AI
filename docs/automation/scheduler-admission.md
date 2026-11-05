---
title: "Scheduling events notifications — scheduler admission"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F17"
updated: "2026-11-05"
---

# Scheduling events notifications — scheduler admission

## How it works

Atomically admit unique schedule/instant occurrence, rechecking current authority. Scheduler invokes canonical runtime rather than another agent loop. Retry delivery independently of execution. Specify overlap/misfire/timezone behavior explicitly.

## Integration

[runtime](../runtime/index.md), [approvals](../approvals/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Concurrent pollers admit one logical run; duplicate event and notification retry do not repeat changes.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
