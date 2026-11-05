---
title: "CLI scheduled jobs"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# CLI scheduled jobs

The CLI exposes job create/list/show/edit/pause/resume and occurrence inspection through the same authenticated gateway as the UI. Exact command flags and wire shapes are proposed until the CLI contract task is approved. The CLI does not directly own SQLite or a scheduler loop.

Require project identity and timezone for calendar schedules. Return stable IDs/status in machine output and nonzero exit status for denied/unavailable/failed operations. Noninteractive use never silently accepts pending approvals.

Read [job behavior](../automation/cron-jobs/how-it-works.md), [schedules](../automation/cron-jobs/schedules.md), [management](../automation/cron-jobs/managing-jobs.md) and [delivery](../automation/cron-jobs/delivery.md). Verify UI and CLI produce equivalent persisted configuration and reject stale revisions.
