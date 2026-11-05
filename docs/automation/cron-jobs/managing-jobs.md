---
title: "Managing jobs"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Managing jobs

Create/edit operations require workspace ownership and expected revision. Pause prevents future admission but does not pretend to cancel a running task. Cancel the run explicitly. Retain past occurrences across configuration changes.

## Acceptance scenario

Race pause/edit/admission and verify truthful states and preserved history.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
