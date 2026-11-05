---
title: "Planning and Build Contracts — build contracts"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F07"
updated: "2026-11-05"
---

# Planning and Build Contracts — build contracts

## How it works

A Build Contract pins requirement revision, plan DAG, workspace, effects, budgets and acceptance criteria. Approval attaches to its digest/revision. New scope produces a new revision; old approval cannot authorize it. Reject dependency cycles before run admission.

## Integration

[requirements](../requirements/index.md), [approvals](../approvals/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Modify an approved plan and confirm new approval is required; Plan Only never dispatches a file write.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
