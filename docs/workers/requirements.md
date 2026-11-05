---
title: "External worker adapters requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F16"
updated: "2026-11-05"
---

# External worker adapters requirements

## Functional scope

F16-R01: Existing internal worker is not proof of external IDE integration; qualify one selected adapter later.

F16-R02: External worker receives parent task identity, bounded root/effects, budget and deadline. Adapter reports progress/receipts but cannot own another independent run authority. Qualify one selected adapter before supporting additional tools.

F16-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F16-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Worker cannot broaden grant; disconnect becomes explicit uncertain state; resumed task deduplicates effects; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Disconnect during effect, resume and reconcile; worker cannot expand scope or silently spawn nested authority.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([runtime](../runtime/index.md), [tools](../tools/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
