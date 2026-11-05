---
title: "How scheduled work runs"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# How scheduled work runs

Atomically create or claim one occurrence for a schedule revision and scheduled instant. Dispatch it to the canonical runtime with stable identity. A poll loop is an observation mechanism, not exclusive ownership; database admission resolves multiple pollers.

## Acceptance scenario

Race two pollers and kill after admission; exactly one logical run is recovered.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
