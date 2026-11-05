---
title: "Webhook authentication and replay"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Webhook authentication and replay

Authenticate the raw body with the configured signature scheme before parsing into business input. Apply timestamp/replay policy and bounded body limits. Map external identity to an allowed internal scope; payload fields cannot claim arbitrary workspace authority.

## Acceptance scenario

Reject altered body, stale timestamp, duplicate event and wrong scope before runtime dispatch.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
