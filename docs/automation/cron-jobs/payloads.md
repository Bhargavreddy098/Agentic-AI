---
title: "Job payloads"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Job payloads

Payload references project, goal/contract revision and bounded budget. Never embed raw credentials or unrestricted executable callbacks. Resolve secret references in trusted code and reject stale scope at execution time.

## Acceptance scenario

Reject malformed payload, moved root and revoked authority without admitting work.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
