---
title: "CLI and headless consumers architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F24"
updated: "2026-11-05"
---

# CLI and headless consumers architecture

## Domain mechanism

CLI parses explicit arguments, authenticates and calls the same API as UI. It owns no direct database or privileged execution route. Noninteractive operation cannot auto-approve effects. Stable JSON output and exit codes distinguish denied, unavailable and failed.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [gateway](../gateway/index.md), [security](../security/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Same operation via CLI/UI yields same state; SIGINT cancels; missing authority exits safely without mutations. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
