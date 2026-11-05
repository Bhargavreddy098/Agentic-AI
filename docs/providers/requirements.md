---
title: "Model providers requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F04"
updated: "2026-11-05"
---

# Model providers requirements

## Functional scope

F04-R01: Preserve exact IDs, native chat, discovery, provider port, tool compatibility, streaming and cancellation.

F04-R02: Adapters preserve exact model identifiers and normalize text, tools, usage and terminal outcomes. Abort flows from user request through coordinator to upstream. Partial output is stored as interrupted; a new provider cannot silently replay already executed effects.

F04-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F04-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

401/429/timeout/interrupted stream normalize correctly; real authorized inference and immediate lease reacquisition; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Real authorized model response; 401/429/timeout/stream truncation controls; cancellation releases lease.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([security](../security/index.md), [routing](../routing/index.md), [sessions](../sessions/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
