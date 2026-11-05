---
title: "Runtime and durable recovery architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F09"
updated: "2026-11-05"
---

# Runtime and durable recovery architecture

## Domain mechanism

Assign stable operation identity before dispatch. Persist intent and actual receipt under fenced run ownership. Recovery distinguishes not-started, confirmed-completed, failed and uncertain. Unknown effects require reconciliation; there is no blanket exactly-once guarantee for external actions.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [planning](../planning/index.md), [providers](../providers/index.md), [tools](../tools/index.md), [verification](../verification/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Kill before/after mutation and receipt persistence; resume cannot duplicate confirmed effect or blindly retry uncertainty. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
