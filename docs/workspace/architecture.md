---
title: "Workspace Git and artifacts architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F11"
updated: "2026-11-05"
---

# Workspace Git and artifacts architecture

## Domain mechanism

Resolve canonical root and target including Windows junctions. Preview changes against a base digest; approval binds that preview. At application recheck target and digest. Preserve user edits on conflict; record resulting artifact digest. Git commit/push are separate effects.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [security](../security/index.md), [approvals](../approvals/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Cross-drive/junction escapes fail; modify base after preview and confirm refusal without overwriting unrelated edits. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
