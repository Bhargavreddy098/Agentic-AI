---
title: "Scheduling events notifications architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F17"
updated: "2026-11-05"
---

# Scheduling events notifications architecture

## Domain mechanism

Atomically admit unique schedule/instant occurrence, rechecking current authority. Scheduler invokes canonical runtime rather than another agent loop. Retry delivery independently of execution. Specify overlap/misfire/timezone behavior explicitly.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [runtime](../runtime/index.md), [approvals](../approvals/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Concurrent pollers admit one logical run; duplicate event and notification retry do not repeat changes. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
