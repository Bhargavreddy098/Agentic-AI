---
title: "Sessions and persistence architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F03"
updated: "2026-11-05"
---

# Sessions and persistence architecture

## Domain mechanism

One SQLite owner serializes writes. Never swallow BEGIN or COMMIT failure. Async callbacks may not interleave inside another request transaction. Tests set an isolated root before importing persistence. Attached databases remain current-source history, not the desired architecture.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [security](../security/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Concurrent writes, rollback, disk-full and process death never yield false committed success. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
