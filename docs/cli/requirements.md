---
title: "CLI and headless consumers requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F24"
updated: "2026-11-05"
---

# CLI and headless consumers requirements

## Functional scope

F24-R01: Current status/read-only TUI only; add authenticated project/session/run commands using same gateway.

F24-R02: CLI parses explicit arguments, authenticates and calls the same API as UI. It owns no direct database or privileged execution route. Noninteractive operation cannot auto-approve effects. Stable JSON output and exit codes distinguish denied, unavailable and failed.

F24-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F24-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Noninteractive mutations require explicit authority; stable exit codes; cancellation propagated; no direct DB bypass; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Same operation via CLI/UI yields same state; SIGINT cancels; missing authority exits safely without mutations.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([gateway](../gateway/index.md), [security](../security/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
