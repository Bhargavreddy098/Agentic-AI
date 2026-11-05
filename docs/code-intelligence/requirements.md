---
title: "MCP and code intelligence requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F13"
updated: "2026-11-05"
---

# MCP and code intelligence requirements

## Functional scope

F13-R01: Authorize actual MCP dispatch; qualify guest ripgrep, Tree-sitter and LSP using pinned artifacts.

F13-R02: MCP discovery returns capability descriptions but grants no execution authority. Validate tool schemas and responses, scope server registration, bound output and cancellation. Search/parsing indexes are tied to project revision; stale results are identified.

F13-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F13-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Unauthorized server/tool rejected; parser cancellation works; bounded outputs; real guest search and diagnostics; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Unauthorized server/tool rejected; real ripgrep and Tree-sitter results; malformed/oversized response bounded.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([tools](../tools/index.md), [workspace](../workspace/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
