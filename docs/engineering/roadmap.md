---
title: "Implementation roadmap"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Implementation roadmap

| Phase | Deliverable | Prerequisite |
|---|---|---|
| IP00 | Source/contract/governance inventory when code is introduced | Documentation review |
| IP01 | Isolated SQLite and reliable transactions | IP00 and approved persistence scope |
| IP02 | Secure desktop, identity, sessions and gateway | IP01 |
| IP03 | Providers and bounded budgets | IP02 |
| IP04 | Workspace, approvals and qualified guest tools | IP02 and guest gate |
| IP05 | Requirements, plans and Build Contracts | IP03 and IP04 policy |
| IP06 | Durable runtime and independent verifier | IP03–IP05 |
| IP07 | Context, MCP and code intelligence | IP06 |
| IP08 | Bounded specialists and review | IP07 |
| IP09 | Complete editor/terminal/planning/monitoring UI and CLI | IP08 |
| IP10 | Local release, backup and restore qualification | IP01–IP09 |
| IP11 | Automation | IP10 |
| IP12 | External workers and browser control | IP10 plus selected adapter approval |
| IP13 | Deployment and external integrations | IP10 plus target approval |

The first production release is IP10. Providers and workspace contracts can advance in parallel after identity stabilizes. UI slices accompany each domain; IP09 completes integration. Minimal browser testing of the product is verification, not permission for general computer control.

First code task after scoped approval: create isolated SQLite paths before imports and prove no working-store fallback. No implementation is authorized by this library.

Each feature implementation guide supplies C/B/U/V task patterns. Before coding a concrete operation, fill exact source owner, wire schema, allowed changes, acceptance command and rollback. The library covers architecture and build guidance; it is not falsely presented as a frozen implementation specification with all future SQL and API choices already approved.
