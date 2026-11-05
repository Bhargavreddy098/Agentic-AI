---
title: "F17 — Scheduling events notifications"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F17"
updated: "2026-11-05"
---

# F17 — Scheduling events notifications

Primary phase: IP11. Target: Atomic SQLite occurrence admission and real canonical run dispatch; policy checks; local delivery outbox.

Dependencies and consumers: [runtime](../runtime/index.md), [approvals](../approvals/index.md). These are responsibility links, not whole-feature build ordering; see the [roadmap](../engineering/roadmap.md).

- [Requirements](requirements.md)
- [Architecture](architecture.md)
- [Contracts](contracts.md)
- [Connections](connections.md)
- [Implementation](implementation.md)
- [Verification](verification.md)
- [Troubleshooting](troubleshooting.md)
- [Scheduler Admission](scheduler-admission.md)

[System index](../INDEX.md)

## Detailed automation topics

- [Scheduled jobs](cron-jobs.md)
- [How scheduled work runs](cron-jobs/how-it-works.md)
- [Recurrence and timezone](cron-jobs/schedules.md)
- [Job payloads](cron-jobs/payloads.md)
- [Managing jobs](cron-jobs/managing-jobs.md)
- [Delivering results](cron-jobs/delivery.md)
- [Scheduled job diagnosis](cron-jobs/troubleshooting.md)
- [Hooks](hooks.md)
- [Hook configuration](hooks/configuration.md)
- [Hook event contracts](hooks/event-types.md)
- [Writing hooks](hooks/writing-hooks.md)
- [Hook troubleshooting](hooks/troubleshooting.md)
- [Webhook authentication and replay](webhooks/authentication-and-replay.md)
- [Notification delivery status](notifications/delivery-status.md)

[CLI job commands](../cli/cron.md)
