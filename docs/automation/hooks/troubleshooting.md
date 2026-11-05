---
title: "Hook troubleshooting"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Hook troubleshooting

Check configuration revision, filter, authorization, deduplication, downstream operation identity and result. Log sanitized reason codes; never raw credentials or unbounded bodies.

## Acceptance scenario

Each blocked hook has a reason; retry consults event identity rather than resubmitting blindly.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
