# Stage 07 local execution qualification — 2026-10-24

Scope: PostgreSQL durable execution foundation and its owner frontend projections. This is local qualification with bounded safe activities and immutable approved contract fixtures. Public execution start, real plan generation, hostile-code workers, independent completion verification, gateway login replacement, and production release are not qualified here.

## Implementation

Migration 015 adds scoped runs, tasks and dependency edges, effects, immutable checkpoints, failures, ordered run events, tool revision identities, agent/context projection identities, reconciliation operation references, and outbox lease metadata. Composite foreign keys enforce workspace/project/run/task ownership. Runtime remains a non-owner without DDL, superuser, or BYPASSRLS. All new scoped tables force RLS.

The dispatcher claims bounded DAG work with PostgreSQL row locks, database-time leases, run/task epochs and attempt limits. Active process ownership is ephemeral; PostgreSQL owns accepted work. State changes, ordered event allocation, audit records and outbox writes commit together. A waiting DAG cannot starve another eligible run. Normal startup registers no synthetic activity adapters and exposes no fixture admission route.

Permanent effect identity binds the run, immutable contract, plan step and effect index. Dispatch rechecks the pinned contract approval, active policy, owner session, deadline and current scoped grant. Receipt bytes are encrypted artifacts, digest-verified and strictly bound to the effect/input/run epoch/task epoch. A committed receipt deduplicates; an ambiguous dispatched effect becomes unknown and blocks instead of being redispatched. Safe successful tasks enter `verifying`; they cannot claim `verified`.

Pause waits for safe quiescence. Resume requires the current immutable checkpoint and epoch, verifies its digest, and rechecks authorization. Cancellation fences existing work, stops new claims and remains cancelling or blocked until effects are reconciled. Shutdown stops claims, signals owned activities, checkpoints quiescent work, closes SSE streams, and drains the database. Expired leases remain recoverable after a process dies.

The dispatcher validates a pinned session through `control.session_valid(uuid)`, a scoped boolean-only security-definer function with a fixed search path. Its migration-owner-only SELECT policy does not change the runtime token-hash RLS policy. Runtime tests prove it cannot retrieve session hashes and cannot validate another workspace's session.

## Approved contract clarification

The owner approved `externalReceiptRef` as an optional project-scoped artifact UUID on 2026-10-24. A reconciliation request supplies evidence; it cannot assert success. Without a qualified trusted reconciler the operation is blocked with `OUTCOME_UNKNOWN`. No arbitrary receipt-write endpoint was added.

Run snapshots include decimal-string `meta.currentSequence` so the frontend can subscribe after a consistent snapshot. SSE uses durable ordered events, authenticated replay, explicit 410 cursor expiry, heartbeats, bounded output, disconnect on slow consumers/session revocation, and shutdown cleanup. Retention removes only a contiguous expired prefix.

Artifact `kind` and `runId` filters remain strictly rejected under the previously approved clarification. This slice does not introduce an artifact taxonomy or a general artifact-to-run write relation. Effect receipt artifacts have explicit scoped references. A future artifact producer must establish a canonical ownership relation before enabling the reserved list filter.

## Verification evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| Clean/repeated/checksum migrations and scoped constraints | Real disposable PostgreSQL suites, immutable migration journal, constraint and RLS failures | PASS |
| Atomic admission, task DAG and fair claims | Transaction rollback, reconstruction, concurrent double claim and waiting-DAG tests | PASS |
| Fencing and bounded recovery | Stale heartbeat/finish/receipt denial; maximum three safe attempts | PASS |
| Actual process death | Kill at before-admission-commit, after-claim, after-prepare, after-dispatch, before-receipt-commit, after-receipt and after-finish | PASS |
| Effect identity and receipt integrity | Changed input rejection, real encrypted receipt bytes, deduplication, no redispatch of unknown or committed effects | PASS |
| Owner controls and reconciliation | HTTP auth/Origin/CSRF/idempotency, strict DTOs, scoped evidence, blocked reconciliation | PASS |
| Pause/cancel/shutdown | Real dispatcher abort signal, quiescent checkpoints, stale epoch denial, open-SSE shutdown | PASS |
| SSE | Committed replay/reconnect, ahead/conflicting cursor denial, 410 retention, revocation, bounded slow-consumer output | PASS |
| Frontend transport | Actual frontend client drives run projections and cancellation against disposable PostgreSQL/HTTP | PASS |
| Frontend checks | 88 tests, typecheck, production webpack build; lint has no errors and five pre-existing unused-variable warnings | PASS |
| Browser | Activity pane opens and correctly requires an owner session; no synthetic production runs | PASS for disconnected state |
| Full regression | `npm test`: 161 passed, zero failed/skipped; includes 39 Stage 07 checks | PASS |

The Stage 06 selected compatible endpoint's existing live qualification remains the provider prerequisite. This task makes no new paid provider call and does not claim new official OpenAI qualification. Safe activity and crash tests do not qualify a later coding worker or external mutation adapter.

## Real local database

Verified PostgreSQL 17.11 and pgvector 0.8.7. Before migration: 14 matching applied checksums, zero projects and zero artifacts. The existing migration command made an encrypted backup before applying only `015-durable-execution.sql`. Repeating it made another encrypted backup and applied nothing. Runtime `npm run db:verify` reports all 15 migrations applied and every readiness check true. The restarted backend returns 200 from canonical `/health/live` and `/health/ready`; unauthenticated run listing returns 401. `npm run identity:verify` passes against the migrated real database, including native launcher bootstrap, protected routes and revocation. Production data was not seeded with fixture runs.

Pre-migration backup: `data/backups/database-1792813957494-41ae3358-9ceb-4a45-abde-3d6ca92fd4e7.asbak`. Migration is additive. Recovery uses the existing encrypted backup/restore workflow into a verified recovery database, followed by the matching application version; there is no destructive down migration and applied migration bytes must not change.

## Commands and frontend

From the repository root:

```powershell
npm run test:execution
npm test
npm run typecheck
npm run lint
npm run db:verify
```

The supplemental [Stage 07 API manifest](api/frontend-stage07.manifest.json) contains 12 canonical routes: 11 frontend-ready read/control/SSE routes and the implemented but deliberately disabled public execution-start guard. The historical Stage 01–06 manifest still covers its 50 routes. `RunActivity` uses the Stage 07 manifest, real JSON transport, reviewed commands and fetch-based SSE with snapshot recovery on 410. It provides paginated runs/tasks/effects/checkpoints/agents, pause/cancel/resume and scoped evidence requests. It never turns message storage into execution.

Authenticated interactive browser scenarios with populated run fixtures were not exercised in the user's empty production workspace; the corresponding transport and API paths were exercised against disposable PostgreSQL instead. This distinction does not qualify an Electron package or gateway. Existing owner authentication stays in place until an authenticated gateway replacement is designed and assigned.

Stage 08 is the next roadmap dependency. No Stage 08 implementation is included.

Final review: a resume response now returns the incremented fenced epoch, matching the subsequently read PostgreSQL projection. All 39 Stage 07 checks passed again after this correction. The responsive inspector returned zero FAIL and two WARN at 1440/768/390; screenshots were reviewed. Secondary metadata uses smaller text, and the unpopulated conversation intentionally leaves a clear transcript area. The Activity pane contrast was corrected and rechecked in the browser. `git diff --check` passes; PRODUCT_IDEA.md retains SHA-256 `4776824a4ab012e6c6f84c4737906de1f3faf21edbc80314e60cd0c16ad47566`. Existing unrelated changes were preserved; no commit or push was made.
