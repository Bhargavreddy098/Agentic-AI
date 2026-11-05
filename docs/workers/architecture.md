---
title: "External worker adapters architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F16"
updated: "2026-11-05"
---

# External worker adapters architecture

## Domain mechanism

External worker receives parent task identity, bounded root/effects, budget and deadline. Adapter reports progress/receipts but cannot own another independent run authority. Qualify one selected adapter before supporting additional tools.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [runtime](../runtime/index.md), [tools](../tools/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Disconnect during effect, resume and reconcile; worker cannot expand scope or silently spawn nested authority. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
