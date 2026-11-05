---
title: "Data and recovery design"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Data and recovery design

## Logical ownership

One SQLite database stores identity/sessions, providers/usage, requirements/plans/contracts, runs/tasks/effects/checkpoints/events, approvals/audit, artifacts, memory, automation and release records. Each family has one writer service. Cross-feature operations use an explicit transaction owner, not shared unowned callbacks.

## Migration from earlier multi-file storage

The earlier project used attached ops, automation, control, knowledge and system databases. Conversion is separately approved: stop new writes, obtain a consistent source snapshot with WAL state, create a separate target, explicitly map domain tables/indexes/keys, preserve IDs and migration provenance, validate counts/digests/constraints and application invariants, then approve activation. Keep original files. Do not edit applied checksums to make conversion pass.

Before activation rollback discards only the identified staging target after review. After new writes begin, restoring old files alone loses data; freeze writes and reconcile under a recovery plan. A backup is not qualified until an isolated restore works.

## Runtime recovery

Record operation intent before dispatch and actual receipt afterward. Crash between them may leave uncertainty; do not claim exactly-once for arbitrary external effects. Fence stale owners, validate checkpoint versions/digests and recheck authority before resume. Cancellation stops future work but preserves completed effects.

## Test isolation

Set an explicit temporary root before importing any persistence code. Assert every possible database/WAL path is inside it. Reject working APPDATA fallback. Inject failed BEGIN/COMMIT, concurrent callbacks and process death. Every failed required write is observable; no swallowed transaction errors.
