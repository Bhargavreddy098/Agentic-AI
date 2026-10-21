# ASI Backend Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the established native sequential execution method. Implement one owner batch at a time; preserve unrelated local changes. The linked batch plans form this plan's task details.

**Goal:** Implement real, owner-backed backend model/repository surfaces for all 50 unfinished original/V2 task entries, without claiming those features are complete.

**Architecture:** Forty-three model/projection families expose focused JavaScript facades in `backend/models`. Existing authoritative repositories remain canonical; missing persistence lives with the SQL-owning modules. Strict shared stored-record contracts are implemented with persistence; public request schemas and controllers follow as separate phases.

**Tech Stack:** Existing Node 24.19.0, Express 5.3.0, PostgreSQL 17, pg 8.23.1, pgvector 0.3.0, Zod 4.6.5, TypeScript 5.9.3, pnpm 12.6.0; no new ORM or external service.

**Spec:** [Approved model design](../specs/2026-10-21-asi-backend-models-design.md).

**Status:** Proposed implementation plan for user review. The user's latest “yes proceed” approves the written model design. No product code or database mutation is performed by this planning task.

**Architecture revision requested:** The user subsequently requested a microservices plan before implementation. See the [service migration proposal](2026-10-21-asi-microservices-migration.md). Retain this plan's record requirements and tests, but revise centralized model placement/migration targets to service ownership after that proposal is accepted. This plan has not been implemented or marked complete.

## Global Constraints

- “first all models covering the 39 unfinished V2 tasks and 11 unfinished original tasks, then validation schemas, then controller logic.” Stored-record validation accompanies persistence; public request-schema/controller work waits until the model phase is qualified.
- “No user role/permission administration is introduced.” Preserve existing agent capability, approval and memory visibility boundaries.
- “Existing owner repositories are wrapped or re-exported; they are not reimplemented as a second writer.”
- “SQL, grant issuance, budget reservation, provider calls and domain state transitions remain in the relevant services/owners.”
- “Old migration files remain byte-identical.” No runtime DDL, production migrations, provider spend, external message delivery or deployment.
- “An absent owner produces an explicit unavailable result.” No synthetic storage fallback, fake success or live-capability promotion.
- “Existing SQLite episode authority stays in place.” No automatic store conversion.
- All 50 source task statuses remain unchanged until their original feature acceptance passes. Model-only qualification is recorded separately.
- Preserve the dirty checkout and earlier OpenClaw work; use the existing `codex/express-backend` branch unless the user changes that preference. Never blanket-stage unrelated work.

## Review Focus

1. Same ID with altered payload, cross-tenant foreign keys and stale revisions: reject conflict atomically; never treat a different payload as a successful idempotent retry.
2. Read projections accidentally inheriting mutation/credential authority: prove zero provider, grant-issuance, execution or external-delivery calls from model operations.
3. Owner/schema disagreement on persisted data: validate reads, compare relational identity/digest/version columns to payload, and fail safely on tampered JSON or unsafe BIGINT values.
4. Expiry/revocation/cancellation while waiting for a database lock: recheck current authority after the wait; release one checked-out connection and avoid partial writes.
5. Migration bootstrap gaps and environment absence: real disposable PostgreSQL and runtime roles must pass; uninstalled vector or unapplied prerequisites must fail qualification rather than skip required tests or edit historical SQL.

The batch plans assign these cases to specific record families and tests. Integration-only original Task 30 and V2-G01 are covered by final coverage/evidence assertions rather than artificial CRUD models.

## Companion files and execution order

- [All-task coverage](../../asi-backend-model-coverage.md): authoritative mapping of the 50 source task IDs.
- [Model implementation catalog](../../asi-backend-model-implementation-map.md) and [machine-readable catalog](../../asi-backend-model-implementation-map.json): exact 43 model paths, factories, methods, primary contracts, storage owners, repository files, persistence basis and family-specific assertions.
- [Batch 1: control and core records](2026-10-21-asi-models-01-core.md).
- [Batch 2: governance and credential metadata](2026-10-21-asi-models-02-governance.md).
- [Batch 3: skills, context and scoped memory](2026-10-21-asi-models-03-memory.md).
- [Batch 4: ingress, schedules, channels and protocols](2026-10-21-asi-models-04-channels.md).
- [Batch 5: reasoning, specialist metadata and projections](2026-10-21-asi-models-05-reasoning.md).
- [Batch 6: workspace, candidates and release metadata](2026-10-21-asi-models-06-experimental.md).

Implement in that order. Six smaller owner plans share one acceptance boundary and one final review; they do not require six new design-approval conversations. If a specific record's source requirements are insufficient, finish independent families and record the precise missing field/behavior rather than inventing a feature.

## Common interfaces and record rules

Create `packages/contracts/src/backend-models/record-metadata.ts` containing these strict model-layer contracts/types, using existing shared primitives:

```ts
type ModelPageQuery = { limit: number; cursor?: string };
type ModelPage<T> = { items: T[]; nextCursor?: string };
type ModelCreateResult<T> =
  | { status: 'created' | 'same_existing'; record: T }
  | { status: 'conflict' };
type ModelRevisionResult<T> =
  | { status: 'updated'; record: T }
  | { status: 'stale' | 'not_found' };
```

`limit` is an integer 1–100. A cursor is an opaque, authenticated tenant/family/query-bound continuation token, at most 2048 characters. Decode/validate it through the bound owner; the browser cannot substitute a tenant, family, sort key or filter. Order new lists by `(created_at, record_id)`, with explicit stable ascending order and strictly later continuation. Existing owner cursor semantics may be retained when equally strict.

Every catalog factory has the documented shape `create<Family>Model({owner,scope,clock})`. Use explicit JSDoc port types and existing package exports. `scope` is verified at trusted composition and bound to tenant/principal, never accepted from HTTP JSON. `clock():number` returns UTC milliseconds. No global mutable store or implicit default tenant.

Unless overridden by a batch's exact authority/projection interface:

- `create*`, `append*`, `register*`, `record*` accept `(record: FamilyRecord, context: RunContext)` and return `Promise<ModelCreateResult<FamilyRecord>>`.
- `get*(id:string)` returns `Promise<FamilyRecord|null>`.
- `list*(query:ModelPageQuery)` returns `Promise<ModelPage<FamilyRecord>>`.
- `revise*(record:FamilyRecord, expectedRevision:number, context:RunContext)` returns `Promise<ModelRevisionResult<FamilyRecord>>`. Use the canonical `version` field for existing ProjectRecord/ScheduleRecord contracts and reject any mismatch between payload and expected revision.
- Missing owner or missing method throws the existing normalized `DEPENDENCY_UNAVAILABLE` error with a safe fixed message. Invalid input uses `INVALID_INPUT`; authority remains governed by the existing owner's error mapping. No fake `[]`, `null` or successful result substitutes for an unavailable owner.

These conventions do not authorize methods absent from the catalog. Append-only families expose no revision/delete methods. The batch plans override credential, approval, schedule/lifecycle transitions, graph queries and projections explicitly.

## SQL mapping conventions

New metadata families use a dedicated table per canonical record family, not one universal JSONB collection. The implementation catalog names each physical table and its relational identity/index fields. Before coding a family's repository, add its complete executable mapping to `backend/database/model-field-map.json`:

```text
family, migrationId, table, storageOwner, schemaExport,
identityColumn, columns[{name,type,nullable,payloadPath}],
constraints[], indexes[], foreignKeys[], allowedTransitions[]
```

Map ID/reference fields to `text`; SHA-256 digests to checked lowercase 64-character text; timestamps to `timestamptz`; revisions/versions to positive integer; safe integer counters/costs to `bigint` with explicit application safe-range checks; closed statuses to checked text; bounded structured report payloads to `jsonb`. Do not narrow an existing record to a guessed field type: use its shared source contract.

For new append-only/versioned metadata rows include `tenant_id`, family-specific ID, `revision` where mutable, `created_at`, `updated_at` where mutable, `payload_digest`, `record_json`. Validate the JSON and assert all redundant typed identity/version/status/digest columns agree when decoding. The primary key/unique identity is `(tenant_id,family_id)`; add `(tenant_id,family_id,revision)` uniqueness for version-reference constraints where needed. Immutable version history uses a separate history table or existing owner journal.

Each foreign key includes tenant plus referenced ID. Add a compatible unique constraint to an existing referenced table in a new migration only when absent; never use `ON DELETE CASCADE` to erase audit/effect evidence. External artifact/credential/provider handles are opaque references checked by their owner rather than false SQL foreign keys into an imaginary table. Semantic goal/plan/version/digest bindings are checked transactionally by the owning service as well as any available relational constraint.

New state tables use tenant RLS with `FORCE ROW LEVEL SECURITY`, a non-owner runtime role without BYPASSRLS, and explicit SQL tenant predicates. Memory tables additionally enforce current permitted scopes/private-agent identity on reads and writes. A trusted schema owner is only for explicit disposable migrations. Row visibility and allowed operations must fail closed before repository methods are exported.

SQL drivers remain in `control`, `govKernel` and `memStore` permitted owners. Supervisor, specialist, tool, sandbox and privacy modules call narrow ports; they do not gain a shared pool because they gained model files. Governance/memory fields must not be writable through a general control-record API. Export per-family repositories and ports only; do not export arbitrary table/SQL access.

## Task 0: Coverage, migration ownership and test harness

**Files:** Create `tests/architecture/backend-model-coverage.test.ts`, `backend/tests/models/owner-boundary.test.js`, `tests/integration/backend-models/harness.ts`, `tests/integration/backend-models/migrations.test.ts`, `docs/backend-model-task-ledger.json`, `backend/database/model-field-map.json`; update `backend/database/migrate.js`, `scripts/verify-v2-guide.mjs`, `scripts/verify-architecture.mjs`, `docs/architecture-baseline.json`, root/backend test scripts and backend manifest where required.

**Produces:** a model-only ledger with batches BM01–BM06, separately reviewed migration ownership, real disposable PostgreSQL harness and exhaustive all-task/model coverage checks. The model ledger records approval only after the user reviews this plan; this planning turn leaves it uncreated/unapproved.

- [ ] Write coverage assertions for exactly the 50 unfinished source IDs, exactly 43 unique non-gate family entries, two model-free integration gates, no duplicated owner/table writer and no model route/capability automatically enabled.
- [ ] Write migration tests RED: reject ID collisions across original/V2/model registries, missing file/owner, unreviewed target, missing prerequisite qualification, cycles, checksum mutation and an attempt to interpret model-only qualification as full feature completion.
- [ ] Extend trusted migration planning with an explicit model target: `reviewedMigrationPlan({root,target:'BM01'})`. Preserve all old target semantics. Model targets bind exact reviewed migration files and owner boundaries in `docs/backend-model-task-ledger.json`; they can qualify data-only prerequisites without changing original/V2 task statuses. Dependency qualification is by exact migration identity plus recorded data-only checks, not a feature-title string or invented completed status.
- [ ] Reserve proposed IDs only after checking all current registries/files: `017-model-core.sql` (BM01), `018-model-governance.sql` (BM02), `019-model-memory.sql` (BM03), `020-observation-bootstrap.sql` (BM03), `021-model-channels.sql` (BM04), `022-model-reasoning.sql` (BM05), `023-model-experimental.sql` (BM06). Retain already-reserved `012-v2-memory-lifecycle.sql` and `013-v2-projects.sql` under their original owners, with explicit data-only review/delegation references from BM03/BM01. No duplicate identity or checksum exists across registries. These are proposed assignments in this plan, not files created now.
- [ ] Model migration DAG: 017 requires 010/011; 013 retains 006/011; 018 requires 009/014/015/016; 020 requires 001/004 and explicitly documents the fresh observation bootstrap correction rather than applying broken 008 first; 012 retains 004; 019 requires 012/020; 021 requires 010/006/017; 022 requires 017/014; 023 requires 017/018. Every listed original prerequisite must actually apply and pass consumed checks in the disposable fixture; no automatic execution of all pending SQL files.
- [ ] Build the fixture using the installed PostgreSQL 17 binaries and a unique temporary database/cluster/schema, with explicit ownership and `finally` cleanup. Never connect to or migrate the user's existing database. A separate runtime role has NOSUPERUSER/NOBYPASSRLS and no schema-create privilege. Missing PostgreSQL/extension is a failed required integration check with a safe explanation, not a green skip.
- [ ] Reproduce the existing observation bootstrap failure on a disposable fixture. Preserve 008 bytes; 020 creates the intended scoped tables/constraints with a nonvolatile validity index `(tenant_id,valid_until)` and explicit expiry filtering in queries. For pre-existing tables, inspect and validate the schema/constraints before claiming qualification; no destructive replacement or falsely journaling 008 as applied.
- [ ] Add `backend:test:models` for native `backend/tests/models/*.test.js`, wire it into `backend:test`, and use the existing Node integration project for `tests/integration/backend-models/*.test.ts`. Add only existing workspace package dependencies that actual model imports consume; pin via `workspace:*` and update lock/inventory with pnpm 12.6.0. No new third-party dependencies.
- [ ] GREEN: run coverage/negative architecture tests, original runner regression tests, model harness tests, backend checkJs and dependency checks. Retain old migration checksum test. Commit only explicitly reviewed owned files; preserve unrelated dirt.

## Owner batch execution and checks

Each linked batch is implemented family by family: RED boundary tests, shared stored-record contracts, canonical owner repository/projection, JavaScript model facade, real PostgreSQL tests for persisted families, then owned checks. Public HTTP request schemas and controllers are deliberately absent from these tasks.

Commands from the repository root:

```powershell
node --test backend/tests/models/*.test.js
node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models --maxWorkers=1
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p backend/jsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js backend packages/contracts tests/architecture/backend-model-coverage.test.ts tests/integration/backend-models
node scripts/verify-architecture.mjs .
node scripts/verify-dependencies.mjs .
```

The integration fixture's private connection details are supplied by the harness; required positive tests do not silently fall back to mocks. Build affected owner packages in dependency order before native JS tests import compiled package exports. Avoid simultaneous full builds/tests on this Windows machine because earlier concurrent runs exhausted memory.

## Final acceptance task

**Files:** Create `docs/release-evidence/asi-backend-models.md`; update the coverage/catalog/model ledger with actual paths, migration IDs and check results. No source feature status is promoted by this task.

- [ ] Run all 43 model suites and all available required PostgreSQL/runtime-role checks. Assert required tests were discovered and no required case was skipped. For vector absence, retain a failing qualification and complete independent families; report the exact unresolved prerequisite.
- [ ] Confirm Task 30 and V2-G01 consume conformance/workflow evidence and have no dummy model/table/API.
- [ ] Run original backend regressions, root lint/types, sequential full workspace build, architecture/dependency/traceability, old SQL checksum and upstream OpenClaw import-integrity checks. Record existing UI evidence/protected-file drift separately; never remove a gate to obtain green output.
- [ ] Read-only final review covers owner boundaries, schema/column agreement, tenant/FK/RLS isolation, append-only evidence, CAS/idempotency and resource cleanup. Resolve substantive findings and rerun only affected checks.
- [ ] Inspect the complete diff and `git diff --check`. No blanket commit of the prior OpenClaw import or unrelated local changes. Delivery lists implemented/reused models, remaining unavailable owners and the actual qualification level.
- [ ] Models phase ends with data-layer evidence. Public schema/controller implementation receives its own concrete endpoint plan; no speculative routes are auto-created for experimental features or metadata-only records.

## Self-review and handoff

Coverage: 43 catalog families in six batches, all 50 source task IDs, two explicit integration gates, source contract reuse and every accepted data-integrity rule. Review Focus cases map to Task 0 plus each batch's boundary tests. No user RBAC, generic JSON collection, ORM, production migration or live-effect permission is added.

The established execution method is native sequential in this chat. User review of this plan is the remaining planning prerequisite before implementation; no new choice of execution method is required.
