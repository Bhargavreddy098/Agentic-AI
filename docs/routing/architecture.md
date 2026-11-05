---
title: "Routing and budgets architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F05"
updated: "2026-11-05"
---

# Routing and budgets architecture

## Domain mechanism

Before inference reserve a bounded budget against eligible routes. Settle reported usage once using durable operation identity. Unreported usage is unknown, not zero. Failed or cancelled requests reconcile reservation state. Fallback must satisfy capabilities and remaining authority.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [providers](../providers/index.md), [approvals](../approvals/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Race two reservations, cancel an active request and repeat settlement; no double debit or unauthorized spend. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
