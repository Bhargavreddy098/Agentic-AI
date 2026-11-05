---
title: "Sessions and persistence requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F03"
updated: "2026-11-05"
---

# Sessions and persistence requirements

## Functional scope

F03-R01: Replace swallowed transaction-control failures; plan single-file conversion and isolated test paths.

F03-R02: One SQLite owner serializes writes. Never swallow BEGIN or COMMIT failure. Async callbacks may not interleave inside another request transaction. Tests set an isolated root before importing persistence. Attached databases remain current-source history, not the desired architecture.

F03-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F03-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

Fail BEGIN/COMMIT honestly; concurrent writers cannot interleave; conversion interruption leaves originals usable; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Concurrent writes, rollback, disk-full and process death never yield false committed success.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([security](../security/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
