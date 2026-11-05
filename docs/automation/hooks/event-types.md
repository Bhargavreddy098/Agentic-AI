---
title: "Hook event contracts"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Hook event contracts

Events contain stable ID, type/version, scope, occurrence time and bounded payload. Discovery/subscription does not grant execution permission. Preserve compatibility for additive fields and reject malformed known data.

## Acceptance scenario

Duplicate ID is deduplicated; unauthorized type cannot dispatch; malformed payload is rejected.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
