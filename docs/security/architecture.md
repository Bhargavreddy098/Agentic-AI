---
title: "Identity security and credentials architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F02"
updated: "2026-11-05"
---

# Identity security and credentials architecture

## Domain mechanism

Electron main accepts one-time credential input through trusted IPC, encrypts with safeStorage and stores an opaque reference. Provider resolution occurs inside trusted processes. Rotation creates a new credential revision; in-flight behavior is explicit and revocation blocks new dispatch.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [sessions](../sessions/index.md), [desktop](../desktop/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Reject forged IPC, unavailable encryption and revoked references; scan renderer/log artifacts for secret canaries. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
