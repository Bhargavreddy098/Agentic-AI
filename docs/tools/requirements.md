---
title: "Tool runtime and sandbox requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F12"
updated: "2026-11-05"
---

# Tool runtime and sandbox requirements

## Functional scope

F12-R01: Qualify exact trusted-local guest; reconcile explicit host opt-in with policy; enforce receipts, bounds and cleanup.

F12-R02: Project commands use the qualified Docker Desktop/WSL2 trusted-local profile. WSL2 is the substrate, not authorization for arbitrary host or distro commands. Enforce bounded filesystem export/mount policy, network rules, resource limits and process cleanup. Timeout is not a sandbox.

F12-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F12-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Docker absence never routes project command to host; timeout kills process tree; network/resource policy verified; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Docker outage never selects host fallback; verify network/resource bounds, timeout cleanup and actual receipt.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([workspace](../workspace/index.md), [approvals](../approvals/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
