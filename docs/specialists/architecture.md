---
title: "Specialists and independent review architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F10"
updated: "2026-11-05"
---

# Specialists and independent review architecture

## Domain mechanism

Parent may delegate repeatedly but specialists cannot delegate. Durable admission allows at most three concurrent specialists. Each receives bounded scope/context and returns attributed artifacts. Independent review checks fixed artifact digest; it cannot widen parent permissions.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [runtime](../runtime/index.md), [context](../context/index.md), [verification](../verification/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Fourth concurrent request rejected; sequential reuse works; nested delegation denied; stale artifact review rejected. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
