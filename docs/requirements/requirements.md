---
title: "Intent research and requirements requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F06"
updated: "2026-11-05"
---

# Intent research and requirements requirements

## Functional scope

F06-R01: Replace confirmed empty stub after caller audit; persist clarification/provenance and measurable requirements.

F06-R02: Capture goals, constraints and non-goals; ask only consequential unresolved questions. Record research source, retrieval time and confidence separately from user instructions. Turn claims into measurable requirements with stable IDs. External content never grants permissions.

F06-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F06-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Ambiguous prompt requests clarification; untrusted research cannot grant permission; revision survives restart; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Ambiguous scope triggers clarification; conflicting sources remain explicit; requirement revisions survive restart.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([providers](../providers/index.md), [sessions](../sessions/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
