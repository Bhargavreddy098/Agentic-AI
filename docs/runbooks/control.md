# M04 control bootstrap and recovery

> **Current platform scope — 2026-10-15:** Build and deploy the Windows version only. Linux is allowed only as an optional VM guest for qualified isolation; standalone Linux hosts/releases are deferred. This supersedes earlier platform assumptions in this document. PostgreSQL/Redis and ordinary integration/security tests remain in the Windows work queue. Preserve required protections and tests; unsupported executable paths stay disabled. See ADR 0004.

This runbook covers R08, R12, R15 and R23. The approved M04 proposal is in [the consolidated guide](../v2-build-guide.md#m04-concrete-boundary-review--approved); current evidence and readiness are in [the live ledger](../v2-task-ledger.json). Original04 evidence and applied001 bytes remain historical records. These instructions do not authorize production migration or deployment.

## Trusted construction

Only an authenticated trusted service constructs `createControlServices(poolConfig, { tenantId, ownerId? })`. Derive tenant from verified identity, never a task's claimed tenant. Missing scope rejects before constructing a pool. Keep database credentials, signing keys and the returned pool inside the trusted service; workers receive no SQL access or credentials. Configure connection and statement timeouts in trusted pool configuration.

Use a non-owner `NOSUPERUSER NOBYPASSRLS` role with schema usage and only the consumed control-table permissions. Do not grant schema creation, migration-journal modification, or worker mounts. Every repository operation opens a transaction and sets parameterized transaction-local tenant/owner settings. RLS is forced on tenants, ingress, sessions, runs, leases, checkpoints, outbox and effect journal. The role must not be a schema/table owner. Budget, policy and audit enforcement remain their later owning tasks.

`ownerId` defaults to a fresh instance ID shared by all repositories in one service. Persist a stable identity only where an operator intentionally resumes that same trusted owner. A different live owner cannot take over. A new owner waits for expiration or an authorized release; it must never copy a payload's epoch or bypass an expiry check.

## Reviewed migration

Use a dedicated connected migration-owner client against an explicitly existing schema. The runner rejects a missing schema rather than falling back to `public`. Inspect the plan first:

```powershell
node scripts/apply-migrations.mjs --target M04
```

The exact closure is `001-control.sql -> 009-identity-grants.sql -> 010-control-qualification.sql`. Other numbered pending files are not applied. The registry and each prerequisite owner's review/completion are checked; SQL bytes are SHA256 journaled under a PostgreSQL advisory transaction lock. An already applied checksum cannot change. The complete closure rolls back on failure, including its journal. Preserve backups and inspect existing data before any separately approved production operation. Private `DATABASE_URL`, `--schema` and explicit `--apply-reviewed` are required for application; do not put credentials into shell history, task messages or worker payloads.

Forward010 converts existing UUID identities/arrays to their text representations without discarding values. It adds safe integer limits, session epochs, scoped references, immutable checkpoint versions, lease ownership and immutable effect context. Legacy leases without an authenticated owner, checkpoints without full original context, effects without immutable intent/epoch, run-bound dispatch without its original epoch, duplicate checkpoint versions and inconsistent references halt migration. Do not synthesize missing authority or delete such records to make it pass; preserve them and obtain a reviewed data-repair procedure. External-schema references require separate migration review. Applied001 and009 are never rewritten.

## Ownership and history

Claiming a session locks its canonical session/run state. Expired/released takeover increments the persistent session epoch across runs; same-owner live replay preserves it. Expiry uses database time, at most 30 seconds and never later than the run deadline. Writers lock session, run and lease in that order and recheck server time after lock waits. Renew/release require current owner/run/epoch and active run/session state. Cancellation, expired deadline, lease loss and stale epoch deny dependent writes.

Checkpoint writes validate the canonical session, run, mode, deadline, parent, epoch and budget identity. Root budget references must follow the same-tenant parent chain to its root, with cycles or depth over64 denied. This verifies identity binding; atomic budget reservation belongs Task06. Full checkpoint JSON is append-only, unique by run/version. An exact replay succeeds; changed content rejects. Historical reads accept UTC deadlines even after expiration, but cannot authorize new writes.

## Retry, restart and uncertain effects

Ingress acceptance and its projection outbox commit together. A changed payload under the same tenant/platform/external identity rejects. Ingress projection alone has a null run; it does not manufacture a dummy run. Run-bound task/effect/approval/delivery dispatch validates canonical scope and retains one immutable logical record under its idempotency identity. Delayed retries are hidden until due; failures use bounded exponential backoff from1second up to60seconds and default5 attempts, then terminal dead-letter. Raw transport errors are not stored because they can contain credentials.

After a connection/process restart, reopen trusted services with the intended tenant and owner identity and read persisted records. A different owner can inspect pending logical dispatch, but cannot mutate a live owner's run-bound records. Outbox reads hide cancelled, expired or superseded epochs. Do not rebind an old immutable dispatch to a new epoch. Actual queue relay and takeover reconciliation are Task14; transport delivery is Tasks16/19. A queue or transport may redeliver: one logical record is not an exactly-once external-effect guarantee.

Effect intent preserves its original effect ID, full request, digests, run, tenant and epoch. Matching replay returns that original ID; conflicting replay rejects before and after authorization. Guarded transitions are planned -> authorized -> executing -> succeeded/failed/unknown, with bounded attempts and current writer fencing. Control journal authorization is not policy approval; Task07 supplies that enforcement. An unknown result is inspected by `reconcile`, never blindly retried. Signed receipts are Task05; actual isolated effects remain later tasks. Loss of a writer may prevent a final status write, so recovery must reconcile reality rather than infer failure from a missing receipt.

## Local qualification

Use only a disposable database named with suffix `_qualification`. Tests create and remove their own random schemas and restricted roles. Qualification uses PostgreSQL17 on Windows; restricted database roles and real service checks are required, but Linux/KVM is not a database prerequisite. Initialize `pgcrypto` once in `public` before concurrently starting suites; extension creation is database-wide and individual schema fixtures must not compete to install it. This is fixture bootstrap, not a production migration.

```powershell
pnpm exec vitest run --project integration backend/modules/control/test/control.test.ts tests/integration/control-v2-qualification.test.ts tests/integration/migration-registry.test.ts
pnpm typecheck
pnpm --filter @asi/control build
```

The original15 control obligations run in the Node integration project against PostgreSQL, with corrected approved contract fixtures. Named qualification checks cover tenant RLS, fencing, lossless history, atomic rollback, immutable intents/dispatch, bounded retries, migration prerequisites/checksums/rollback and competing runners. No absent-service skip or empty-suite success qualifies M04. Identity unit/security/live PostgreSQL regressions and architecture/dependency/traceability checks remain required affected-foundation validation.

This is local control qualification. It does not qualify frontend, policy, spend reservations, queue relay, a complete agent workflow, production deployment or release. Consult fresh ledger counts and limitations before consuming this foundation.
