---
title: "Planning and Build Contracts requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F07"
updated: "2026-11-05"
---

# Planning and Build Contracts requirements

## Functional scope

F07-R01: Bind task DAG, requirement revision, budget, allowed effects and acceptance to immutable approved contract.

F07-R02: A Build Contract pins requirement revision, plan DAG, workspace, effects, budgets and acceptance criteria. Approval attaches to its digest/revision. New scope produces a new revision; old approval cannot authorize it. Reject dependency cycles before run admission.

F07-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F07-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Changing scope invalidates old approval; cyclic plans fail; plan-only produces no project mutation; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Modify an approved plan and confirm new approval is required; Plan Only never dispatches a file write.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([requirements](../requirements/index.md), [approvals](../approvals/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
