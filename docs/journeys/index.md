---
title: "Cross-feature journeys"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Cross-feature journeys

| User workflow | Connected owners |
|---|---|
| Add provider and stream | Desktop credential broker -> providers -> routing -> sessions -> UI |
| Select folder and change code | Desktop -> workspace -> approvals -> tools -> verification |
| Idea to approved application | Requirements -> planning -> approvals -> runtime -> verification |
| Specialist delegation | Runtime -> context -> specialists -> review -> consolidation |
| Scheduled review | Automation -> current policy -> runtime -> verification -> notification |
| Restart and recover | SQLite -> effect journal -> reconciliation -> events -> consumer |

Each feature connections.md owns its handoff detail. See [governed execution](governed-execution.md). The CLI and UI invoke the same operations and cannot independently implement permission or scheduler policy.
