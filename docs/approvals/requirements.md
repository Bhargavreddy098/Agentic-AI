---
title: "Approvals and governance requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F08"
updated: "2026-11-05"
---

# Approvals and governance requirements

## Functional scope

F08-R01: Server-classified risk and exact action proofs; preserve legacy mode wire values with explicit four-mode mapping proposal.

F08-R02: Classify risk in trusted code, bind permission to exact action/target/input digest and current principal. Pending, approved, rejected, expired and consumed are distinct. Approval display is derived from the same descriptor used by execution.

F08-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F08-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Spoofed actor/risk, expired/replayed grant and changed action digest are denied before dispatch; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Spoof risk/actor, alter target after approval, replay proof and revoke authority; deny before any effect.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([security](../security/index.md), [sessions](../sessions/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
