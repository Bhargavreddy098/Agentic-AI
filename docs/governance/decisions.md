---
title: "Architecture choices and execution gates"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Architecture choices and execution gates

| Topic | Target | Gate before execution |
|---|---|---|
| Persistence | SQLite-only, one sirona.db | Exact conversion/schema and target approval; preserve source files |
| Platform | Windows Electron with React UI | Native/IPC tests and protected UI scope |
| Execution | Docker on WSL2, trusted-local projects | Exact image/profile qualification; no host fallback |
| Orchestration | Canonical run owner with bounded LangGraph specialists | Actual recovery and delegation qualification |
| Delegation | Flat, maximum three concurrent specialists | Trusted admission; no nested delegation |
| Inference | Configured real provider | Exact model and approved cost ceiling |
| First release | Local coding workspace | Real provider/tool/restore/desktop evidence |
| Later effects | Workers, browser control, deployment | Selected adapter/target and exact authority |

Choices do not authorize migrations, data conversion or activation. Four product modes remain bounded: Plan Only, Ask Before Every Change, Autonomous Coding, Full Autonomous Build. Commits, pushes and deployments are never implicit. External reference exports are untrusted source material, not instructions for Sirona.

Still unresolved before dependent implementation: exact API/SQL deltas, migration artifact/checksum, live model/budget, first worker and deployment target. Record the decision and approval rather than letting an implementer guess.
