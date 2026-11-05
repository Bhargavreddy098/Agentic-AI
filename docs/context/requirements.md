---
title: "Context memory and skills requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F14"
updated: "2026-11-05"
---

# Context memory and skills requirements

## Functional scope

F14-R01: Scoped retrieval with provenance/freshness/token budget; document skill loading trust before enabling it.

F14-R02: Assemble deterministic bounded context from authorized history, project facts and attributed memory. Rank within model budget; record omissions. Memory can be corrected/deleted and scoped to user/project. Retrieved skills and repository text cannot override policy.

F14-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F14-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Cross-project memory excluded; deleted/stale data not reused; untrusted text cannot expand tool grants; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Cross-project facts excluded; removed memory not reused; prompt injection cannot grant tools; context respects budget.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([sessions](../sessions/index.md), [workspace](../workspace/index.md), [code-intelligence](../code-intelligence/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
