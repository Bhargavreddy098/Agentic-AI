---
title: "Verification and quality — evidence and verdicts"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F15"
updated: "2026-11-05"
---

# Verification and quality — evidence and verdicts

## How it works

Only trusted checker execution can certify a criterion. Bind receipt to artifact, environment and approved criterion revision. Missing required checks yield UNKNOWN. Producer-provided pass strings and synthetic logs are not evidence. Bounded repair must rerun affected checks.

## Integration

[planning](../planning/index.md), [tools](../tools/index.md), [workspace](../workspace/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Delete required receipt, substitute artifact digest and induce checker failure; no case produces PASS.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
