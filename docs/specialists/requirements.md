---
title: "Specialists and independent review requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F10"
updated: "2026-11-05"
---

# Specialists and independent review requirements

## Functional scope

F10-R01: Qualify flat parent delegation, max three concurrent specialists, independent artifact review and bounded repair.

F10-R02: Parent may delegate repeatedly but specialists cannot delegate. Durable admission allows at most three concurrent specialists. Each receives bounded scope/context and returns attributed artifacts. Independent review checks fixed artifact digest; it cannot widen parent permissions.

F10-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F10-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Fourth concurrent specialist rejected; nested delegation denied; sequential reuse allowed; stale review rejected; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Fourth concurrent request rejected; sequential reuse works; nested delegation denied; stale artifact review rejected.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([runtime](../runtime/index.md), [context](../context/index.md), [verification](../verification/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
