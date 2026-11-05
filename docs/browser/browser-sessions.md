---
title: "Browser and computer runtime — browser sessions"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F18"
updated: "2026-11-05"
---

# Browser and computer runtime — browser sessions

## How it works

Create bounded isolated browser profiles; navigation/read versus upload/download/account changes have different permissions. Page content is untrusted. Actual browser observations produce evidence; absence of adapter returns unavailable. Computer control needs separate narrow targeting.

## Integration

[tools](../tools/index.md), [approvals](../approvals/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Unconfigured browser cannot claim success; denied sensitive action causes no effect; profile and child resources cleaned.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
