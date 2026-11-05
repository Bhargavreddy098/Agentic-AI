---
title: "Delivering results"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Delivering results

Persist the run result once and queue a delivery referencing it. Delivery retries have their own identity. A notification failure must not rerun project changes. Local inbox is first release destination; email and webhooks need separate configuration and qualification.

## Acceptance scenario

Fail delivery after success, retry and verify one execution plus eventual correct notification.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
