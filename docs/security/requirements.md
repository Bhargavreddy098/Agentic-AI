---
title: "Identity security and credentials requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F02"
updated: "2026-11-05"
---

# Identity security and credentials requirements

## Functional scope

F02-R01: Qualify trusted IPC, DPAPI availability, secret references, revocation and backend credential resolution.

F02-R02: Electron main accepts one-time credential input through trusted IPC, encrypts with safeStorage and stores an opaque reference. Provider resolution occurs inside trusted processes. Rotation creates a new credential revision; in-flight behavior is explicit and revocation blocks new dispatch.

F02-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F02-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Reject untrusted sender and revoked identity; scan renderer/log artifacts for secret canaries; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Reject forged IPC, unavailable encryption and revoked references; scan renderer/log artifacts for secret canaries.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([sessions](../sessions/index.md), [desktop](../desktop/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
