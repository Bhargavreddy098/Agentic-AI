---
title: "Deployment and integrations — health and rollback"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F19"
updated: "2026-11-05"
---

# Deployment and integrations — health and rollback

## How it works

Preview pins artifact, environment, target and rollback strategy. Separate approval authorizes deployment. Record real external release identity and measured health; reconcile uncertain outcome before retry. Target selection is a prerequisite, not an arbitrary adapter choice.

## Integration

[verification](../verification/index.md), [approvals](../approvals/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Changed artifact invalidates approval; real health probes required; failed deployment follows tested target rollback.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
