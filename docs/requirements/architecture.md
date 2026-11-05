---
title: "Intent research and requirements architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F06"
updated: "2026-11-05"
---

# Intent research and requirements architecture

## Domain mechanism

Capture goals, constraints and non-goals; ask only consequential unresolved questions. Record research source, retrieval time and confidence separately from user instructions. Turn claims into measurable requirements with stable IDs. External content never grants permissions.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [providers](../providers/index.md), [sessions](../sessions/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Ambiguous scope triggers clarification; conflicting sources remain explicit; requirement revisions survive restart. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
