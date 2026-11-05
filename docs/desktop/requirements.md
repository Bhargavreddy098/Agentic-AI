---
title: "Desktop shell and security requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F22"
updated: "2026-11-05"
---

# Desktop shell and security requirements

## Functional scope

F22-R01: Preserve window.sirona bridge; qualify readiness, trusted senders, startup/shutdown and restart.

F22-R02: Electron main owns native capabilities; preload is a narrow typed allowlist. Authenticate sender origin/frame before action. Renderer never receives generic shell/fs or decryption. Backend startup/readiness and window lifecycle expose truthful states.

F22-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F22-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Electron restart restores session; forged IPC rejected; backend crash visible; own child processes cleaned; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Forged sender denied; restart restores session; stopped backend shows unavailable; owned processes cleaned.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([security](../security/index.md), [gateway](../gateway/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
