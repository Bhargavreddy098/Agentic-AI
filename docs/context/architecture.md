---
title: "Context memory and skills architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F14"
updated: "2026-11-05"
---

# Context memory and skills architecture

## Domain mechanism

Assemble deterministic bounded context from authorized history, project facts and attributed memory. Rank within model budget; record omissions. Memory can be corrected/deleted and scoped to user/project. Retrieved skills and repository text cannot override policy.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [sessions](../sessions/index.md), [workspace](../workspace/index.md), [code-intelligence](../code-intelligence/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Cross-project facts excluded; removed memory not reused; prompt injection cannot grant tools; context respects budget. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
