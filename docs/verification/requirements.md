---
title: "Verification and quality requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F15"
updated: "2026-11-05"
---

# Verification and quality requirements

## Functional scope

F15-R01: Remove no-results default pass behavior; obtain trusted checker receipts and bind verdict to artifact/contract.

F15-R02: Only trusted checker execution can certify a criterion. Bind receipt to artifact, environment and approved criterion revision. Missing required checks yield UNKNOWN. Producer-provided pass strings and synthetic logs are not evidence. Bounded repair must rerun affected checks.

F15-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F15-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Absent checks yield unknown; bad artifact fails; producer-supplied success cannot certify itself; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Delete required receipt, substitute artifact digest and induce checker failure; no case produces PASS.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([planning](../planning/index.md), [tools](../tools/index.md), [workspace](../workspace/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
