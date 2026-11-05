---
title: "Frontend product surfaces requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F23"
updated: "2026-11-05"
---

# Frontend product surfaces requirements

## Functional scope

F23-R01: Active UI is compact chat; client wrappers do not establish IDE views; add editor/terminal/plans/approvals/monitoring within approved design.

F23-R02: React owns drafts/tabs and renders canonical server state. Editor, diff, terminal, plan, approvals and monitoring use actual APIs. Use Zustand for client state and TanStack Query for server cache where justified; React Flow projects recorded tasks. Preserve compact design.

F23-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F23-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Every visible action hits canonical API; offline/loading/empty/error/cancel states; no hardcoded workspace/model treated as real; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: No hardcoded provider/workspace success; reconnect restores state without dispatching twice; keyboard/accessibility flows work.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([gateway](../gateway/index.md), [runtime](../runtime/index.md), [workspace](../workspace/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
