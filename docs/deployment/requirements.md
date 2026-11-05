---
title: "Deployment and integrations requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F19"
updated: "2026-11-05"
---

# Deployment and integrations requirements

## Functional scope

F19-R01: Replace synthetic active/healthy result paths with fail-closed availability; qualify one approved target later.

F19-R02: Preview pins artifact, environment, target and rollback strategy. Separate approval authorizes deployment. Record real external release identity and measured health; reconcile uncertain outcome before retry. Target selection is a prerequisite, not an arbitrary adapter choice.

F19-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F19-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Changed digest invalidates approval; real health evidence required; uncertain external result reconciled; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Changed artifact invalidates approval; real health probes required; failed deployment follows tested target rollback.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([verification](../verification/index.md), [approvals](../approvals/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
