---
title: "Observability and evaluations — correlation and redaction"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F20"
updated: "2026-11-05"
---

# Observability and evaluations — correlation and redaction

## How it works

Correlate request/run/effect/model activity without secret payloads. Derive costs from actual usage and diagnostics from real probes. Unknown is distinct from healthy. Retention and exported diagnostics are explicit and scoped.

## Integration

[sessions](../sessions/index.md), [runtime](../runtime/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Inject secret canaries and missing probes; no leakage or fabricated healthy/security flags.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
