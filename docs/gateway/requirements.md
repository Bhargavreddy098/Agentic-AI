---
title: "Gateway and transport requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F01"
updated: "2026-11-05"
---

# Gateway and transport requirements

## Functional scope

F01-R01: Reconcile registered routes, session scope and durable SSE replay; keep controllers thin.

F01-R02: Persist run events with monotonically increasing sequence under the execution owner. A reconnect supplies the last observed cursor; server validates scope and retained history. If history expired, return explicit resynchronization rather than inventing events. Slow consumers are bounded and disconnected safely.

F01-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F01-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Reject forged origins and cross-workspace reads; replay ordered events once after disconnect; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Reconnect after token/tool events; no duplicated mutation or missing terminal outcome.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([security](../security/index.md), [sessions](../sessions/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
