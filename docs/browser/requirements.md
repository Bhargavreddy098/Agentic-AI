---
title: "Browser and computer runtime requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F18"
updated: "2026-11-05"
---

# Browser and computer runtime requirements

## Functional scope

F18-R01: Replace synthetic completed browser logs with unavailable state first; later real bounded browser adapter.

F18-R02: Create bounded isolated browser profiles; navigation/read versus upload/download/account changes have different permissions. Page content is untrusted. Actual browser observations produce evidence; absence of adapter returns unavailable. Computer control needs separate narrow targeting.

F18-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F18-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Unconfigured browser never reports success; real navigation evidence, denied sensitive action, cleanup; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Unconfigured browser cannot claim success; denied sensitive action causes no effect; profile and child resources cleaned.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([tools](../tools/index.md), [approvals](../approvals/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
