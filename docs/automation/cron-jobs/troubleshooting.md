---
title: "Scheduled job diagnosis"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Scheduled job diagnosis

Inspect enabled state, timezone, next due instant, overlap, current authority and dependency readiness. Distinguish skipped, queued, blocked and failed. Missing delivery is not evidence the run did not execute.

## Acceptance scenario

Every intentional non-run has a safe actionable reason; unavailable guest/provider handled independently.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
