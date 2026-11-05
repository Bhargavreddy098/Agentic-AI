---
title: "Scheduling events notifications requirements"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F17"
updated: "2026-11-05"
---

# Scheduling events notifications requirements

## Functional scope

F17-R01: Atomic SQLite occurrence admission and real canonical run dispatch; policy checks; local delivery outbox.

F17-R02: Atomically admit unique schedule/instant occurrence, rechecking current authority. Scheduler invokes canonical runtime rather than another agent loop. Retry delivery independently of execution. Specify overlap/misfire/timezone behavior explicitly.

F17-R03: Authentication, workspace scope and action policy are enforced at the trusted domain boundary. Inputs from model, repository or browser are data, not authority.

F17-R04: Cancellation and dependency failure are visible; no simulated success is substituted for an unavailable dependency.

## Observable completion

DST/misfire/overlap tests; duplicate signed event creates one logical run; delivery retry never reruns code; real UI/CLI journey where applicable and source-bound evidence.

Boundary scenario: Concurrent pollers admit one logical run; duplicate event and notification retry do not repeat changes.

## Scope and exclusions

Only this domain owns its canonical decisions. Its peers ([runtime](../runtime/index.md), [approvals](../approvals/index.md)) remain distinct owners. No new database, orchestration framework or copied OpenClaw subsystem is justified by folder names. Product effects require the approval scope in [governance](../governance/decisions.md).

Requirements map to scenarios in [verification](verification.md); implementation proof remains NOT RUN.
