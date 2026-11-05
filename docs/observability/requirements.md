---
title: "Observability and evaluations requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F20"
updated: "2026-11-05"
---

# Observability and evaluations requirements

## Functional scope

F20-R01: Correlate run/effect/model events, redact secrets and replace unconditional health/security claims with measurements.

F20-R02: Correlate request/run/effect/model activity without secret payloads. Derive costs from actual usage and diagnostics from real probes. Unknown is distinct from healthy. Retention and exported diagnostics are explicit and scoped.

F20-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F20-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Canary secrets absent; costs derived from actual usage; missing probes report unknown rather than healthy; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Inject secret canaries and missing probes; no leakage or fabricated healthy/security flags.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([sessions](../sessions/index.md), [runtime](../runtime/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
