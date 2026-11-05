---
title: "Desktop shell and security architecture"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F22"
updated: "2026-11-05"
---

# Desktop shell and security architecture

## Domain mechanism

Electron main owns native capabilities; preload is a narrow typed allowlist. Authenticate sender origin/frame before action. Renderer never receives generic shell/fs or decryption. Backend startup/readiness and window lifecycle expose truthful states.

## Ownership and flow

Authenticated caller -> validated domain operation -> authoritative state/policy -> qualified dependency -> durable result -> event/consumer projection. UI, CLI and automation share this owner rather than duplicating logic.

The domain records stable entity and operation identities. Model-generated arguments do not define principal, risk or lease authority. Reads remain scoped; mutations check current revision and approval where applicable.

Peers: [security](../security/index.md), [gateway](../gateway/index.md). Shared cross-system policy belongs in [system architecture](../architecture/system-design.md).

## Persistence and recovery

The target persistence owner is one SQLite database. Domain records reference shared identities instead of copying authoritative entities. Transactions must propagate failures. Effects preserve receipts for restart reconciliation; unknown external outcomes block blind retry. A cancelled request cannot pretend a completed effect was undone.

## Qualification boundary

Forged sender denied; restart restores session; stopped backend shows unavailable; owned processes cleaned. [Verification](verification.md) defines expected evidence. This is design, not a claim that the earlier source already obeys these rules.
