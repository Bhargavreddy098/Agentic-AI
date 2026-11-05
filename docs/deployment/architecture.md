---
title: "Deployment and integrations architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F19"
updated: "2026-11-05"
---

# Deployment and integrations architecture

## Domain mechanism

Preview pins artifact, environment, target and rollback strategy. Separate approval authorizes deployment. Record real external release identity and measured health; reconcile uncertain outcome before retry. Target selection is a prerequisite, not an arbitrary adapter choice.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [verification](../verification/index.md), [approvals](../approvals/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Changed artifact invalidates approval; real health probes required; failed deployment follows tested target rollback. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
