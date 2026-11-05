---
title: "Runtime and durable recovery requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F09"
updated: "2026-11-05"
---

# Runtime and durable recovery requirements

## Functional scope

F09-R01: One run authority; fencing, stable operation keys, cancellation, reconciliation and version-pinned resume.

F09-R02: Assign stable operation identity before dispatch. Persist intent and actual receipt under fenced run ownership. Recovery distinguishes not-started, confirmed-completed, failed and uncertain. Unknown effects require reconciliation; there is no blanket exactly-once guarantee for external actions.

F09-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F09-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Kill before/after each mutation boundary; no duplicate effect; uncertain outcome blocks blind retry; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Kill before/after mutation and receipt persistence; resume cannot duplicate confirmed effect or blindly retry uncertainty.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([planning](../planning/index.md), [providers](../providers/index.md), [tools](../tools/index.md), [verification](../verification/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
