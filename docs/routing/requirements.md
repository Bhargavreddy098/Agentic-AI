---
title: "Routing and budgets requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F05"
updated: "2026-11-05"
---

# Routing and budgets requirements

## Functional scope

F05-R01: Unify capability eligibility and budget reservation/settlement; forbid replay after partial side effects.

F05-R02: Before inference reserve a bounded budget against eligible routes. Settle reported usage once using durable operation identity. Unreported usage is unknown, not zero. Failed or cancelled requests reconcile reservation state. Fallback must satisfy capabilities and remaining authority.

F05-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F05-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Concurrent requests respect limit; cancellation settles once; unsupported tool capability fails explicitly; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Race two reservations, cancel an active request and repeat settlement; no double debit or unauthorized spend.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([providers](../providers/index.md), [approvals](../approvals/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
