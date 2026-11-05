---
title: "MCP and code intelligence architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F13"
updated: "2026-11-05"
---

# MCP and code intelligence architecture

## Domain mechanism

MCP discovery returns capability descriptions but grants no execution authority. Validate tool schemas and responses, scope server registration, bound output and cancellation. Search/parsing indexes are tied to project revision; stale results are identified.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [tools](../tools/index.md), [workspace](../workspace/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Unauthorized server/tool rejected; real ripgrep and Tree-sitter results; malformed/oversized response bounded. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
