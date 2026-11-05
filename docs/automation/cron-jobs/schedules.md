---
title: "Recurrence and timezone"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Recurrence and timezone

Store an IANA timezone, recurrence type and explicit DST/misfire policy. Calendar recurrence differs from elapsed interval. Define skip/latest/bounded-catchup behavior for machine sleep and restart. Do not launch unbounded overdue work.

## Acceptance scenario

Test DST gap/fold, invalid fields, timezone edit and missed occurrences.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
