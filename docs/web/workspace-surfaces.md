---
title: "Frontend product surfaces — workspace surfaces"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F23"
updated: "2026-11-05"
---

# Frontend product surfaces — workspace surfaces

## How it works

React owns drafts/tabs and renders canonical server state. Editor, diff, terminal, plan, approvals and monitoring use actual APIs. Use Zustand for client state and TanStack Query for server cache where justified; React Flow projects recorded tasks. Preserve compact design.

## Integration

[gateway](../gateway/index.md), [runtime](../runtime/index.md), [workspace](../workspace/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

No hardcoded provider/workspace success; reconnect restores state without dispatching twice; keyboard/accessibility flows work.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
