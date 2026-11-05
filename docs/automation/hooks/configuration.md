---
title: "Hook configuration"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Hook configuration

Register identity, event filter, target operation and resource bounds. Changes create a versioned configuration; disable prevents new admission. Secret references are resolved only by trusted services.

## Acceptance scenario

Invalid filter and workspace mismatch fail; disable survives restart.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
