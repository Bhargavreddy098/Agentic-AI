# Stage 07 implementation plan — 2026-10-24

Assigned: durable PostgreSQL tasks/effects/checkpoints/outbox/SSE; preserve Stages 01–06 and current user changes. No Stage 08+, public execution-start, host worker fallback, paid effects, or gateway authentication substitution.

Order: migration/constraints -> scoped orchestration port and internal fixture admission -> lease/fence/effect/recovery/checkpoint -> owner HTTP/SSE -> controlled dispatcher lifecycle -> real PostgreSQL crash/concurrency/security tests -> backup and local migration/qualification -> frontend projections -> evidence.

Reuses: scoped transactions, executeCommand/idempotency/outbox, active policy/approval/grant/budget ports, immutable planning identities, repository snapshots, canonical owner session middleware, existing provider port. Legacy Map orchestrator remains excluded from composition.

Decisions: synthetic activity adapters are test-only, registered by trusted test composition. No HTTP adapter/agent registration or synthetic production data. Finished Stage 07 safe work enters verifying; only a later independent verifier may mark verified. Unknown dispatched effects block rather than redispatch. Gateway login replacement is deferred; bootstrap remains until an authenticated replacement is defined.

Migration recovery: expand-only migration 015, no applied migration edits or data deletion. First test clean/repeated/checksum paths in a disposable database. Existing local database must be inspected/backed up by existing encrypted backup tooling before applying. Recovery restores a verified backup; no destructive down migration.

Acceptance: exact canonical read/control routes; owner/CSRF/idempotency; scoped FKs/RLS and pool reset; same-client atomic transitions; DAG bounds; concurrent claims; stale task/run fences; stable effect identity and receipt deduplication; safe/unknown crash recovery; cancellation/pause checkpoint semantics; ordered durable events, replay/expiry/backpressure/session revocation; graceful shutdown and restart persistence. Unrun criteria remain UNVERIFIED.
