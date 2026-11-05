---
title: "Approvals and governance architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F08"
updated: "2026-11-05"
---

# Approvals and governance architecture

## Domain mechanism

Classify risk in trusted code, bind permission to exact action/target/input digest and current principal. Pending, approved, rejected, expired and consumed are distinct. Approval display is derived from the same descriptor used by execution.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [security](../security/index.md), [sessions](../sessions/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Spoof risk/actor, alter target after approval, replay proof and revoke authority; deny before any effect. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
