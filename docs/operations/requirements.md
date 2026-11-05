---
title: "Release backup and recovery requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F21"
updated: "2026-11-05"
---

# Release backup and recovery requirements

## Functional scope

F21-R01: Backup/restore currently unavailable; implement consistent single-file backup, isolated restore and packaging qualification.

F21-R02: A qualified backup is consistent and integrity checked; restore is rehearsed into an isolated destination. Single-file conversion preserves originals. Updates retain compatible recovery paths; after new target writes, rollback cannot simply point at stale old data.

F21-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F21-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Restore validated backup on clean fixture; corrupted backup refused; rollback retains pre-upgrade data; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Restore actual backup into fresh fixture; corrupt backup refused; restored application state matches invariants.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([sessions](../sessions/index.md), [desktop](../desktop/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
