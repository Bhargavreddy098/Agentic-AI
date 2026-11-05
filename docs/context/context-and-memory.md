---
title: "Context memory and skills — context and memory"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F14"
updated: "2026-11-05"
---

# Context memory and skills — context and memory

## How it works

Assemble deterministic bounded context from authorized history, project facts and attributed memory. Rank within model budget; record omissions. Memory can be corrected/deleted and scoped to user/project. Retrieved skills and repository text cannot override policy.

## Integration

[sessions](../sessions/index.md), [workspace](../workspace/index.md), [code-intelligence](../code-intelligence/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Cross-project facts excluded; removed memory not reused; prompt injection cannot grant tools; context respects budget.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
