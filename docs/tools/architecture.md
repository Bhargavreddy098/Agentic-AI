---
title: "Tool runtime and sandbox architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F12"
updated: "2026-11-05"
---

# Tool runtime and sandbox architecture

## Domain mechanism

Project commands use the qualified Docker Desktop/WSL2 trusted-local profile. WSL2 is the substrate, not authorization for arbitrary host or distro commands. Enforce bounded filesystem export/mount policy, network rules, resource limits and process cleanup. Timeout is not a sandbox.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [workspace](../workspace/index.md), [approvals](../approvals/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Docker outage never selects host fallback; verify network/resource bounds, timeout cleanup and actual receipt. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
