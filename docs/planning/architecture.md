---
title: "Planning and Build Contracts architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F07"
updated: "2026-11-05"
---

# Planning and Build Contracts architecture

## Domain mechanism

A Build Contract pins requirement revision, plan DAG, workspace, effects, budgets and acceptance criteria. Approval attaches to its digest/revision. New scope produces a new revision; old approval cannot authorize it. Reject dependency cycles before run admission.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [requirements](../requirements/index.md), [approvals](../approvals/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Modify an approved plan and confirm new approval is required; Plan Only never dispatches a file write. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
