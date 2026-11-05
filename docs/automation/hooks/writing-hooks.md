---
title: "Writing hooks"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Writing hooks

Use typed decoding followed by scoped dispatch to the canonical owner. Never place arbitrary shell execution or business SQL in a transport callback. Propagate causation identity and bound loops created by hooks reacting to emitted events.

## Acceptance scenario

Trigger a recursive chain and confirm termination; repeated event does not duplicate the logical effect.

## Connections

[Automation index](../index.md) · [Contracts](../contracts.md) · [Verification](../verification.md)

These scenarios are NOT RUN. Exact wire fields and adapter configuration are reviewed in the operation contract task before coding.
