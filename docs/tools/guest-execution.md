---
title: "Tool runtime and sandbox — guest execution"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F12"
updated: "2026-11-05"
---

# Tool runtime and sandbox — guest execution

## How it works

Project commands use the qualified Docker Desktop/WSL2 trusted-local profile. WSL2 is the substrate, not authorization for arbitrary host or distro commands. Enforce bounded filesystem export/mount policy, network rules, resource limits and process cleanup. Timeout is not a sandbox.

## Integration

[workspace](../workspace/index.md), [approvals](../approvals/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Docker outage never selects host fallback; verify network/resource bounds, timeout cleanup and actual receipt.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
