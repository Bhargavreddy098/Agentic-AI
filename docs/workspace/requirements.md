---
title: "Workspace Git and artifacts requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F11"
updated: "2026-11-05"
---

# Workspace Git and artifacts requirements

## Functional scope

F11-R01: Canonical roots, bounded reads, digest-bound previews and atomic patches; Git status/diff without auto commit/push.

F11-R02: Resolve canonical root and target including Windows junctions. Preview changes against a base digest; approval binds that preview. At application recheck target and digest. Preserve user edits on conflict; record resulting artifact digest. Git commit/push are separate effects.

F11-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F11-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Junction and cross-drive escapes fail; modified base causes conflict; rollback preserves unrelated edits; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Cross-drive/junction escapes fail; modify base after preview and confirm refusal without overwriting unrelated edits.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([security](../security/index.md), [approvals](../approvals/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
