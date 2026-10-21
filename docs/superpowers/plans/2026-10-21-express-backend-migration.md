# Express Backend Folder Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for recommended native sequential execution, or superpowers:subagent-driven-development if explicitly selected. Implement one checkbox step at a time; preserve unrelated local changes.

**Goal:** Consolidate ASI backend code under root `backend/`, replace its active Hono HTTP layer with Express, and retain PostgreSQL/pgvector, existing domain behavior and OpenClaw API compatibility.

**Architecture:** JavaScript ES modules provide `server.js`, `app.js`, configuration and the requested route/controller/service/model/schema/middleware layers. Existing TypeScript backend packages relocate into `backend/modules` with stable package names and compiled exports. Workers remain separate processes under `backend/workers`; moving files does not merge credential, policy or execution boundaries.

**Tech Stack:** Existing Node 24.19.0, pnpm 12.6.0, TypeScript 5.9.3, pg 8.23.1 and Zod 4.6.5; qualified exact Express 5, pgvector Node integration, Helmet, express-rate-limit and Pino packages; existing Vitest/Playwright.

**Spec:** [Approved backend design](../specs/2026-10-21-express-backend-layout.md).

**Review status:** Approved by the user and implemented in the current checkout. See [execution evidence](../../release-evidence/express-backend-migration.md) for completed checks and explicit outstanding environment/product qualifications. Detailed unchecked items below remain a record of the original planned acceptance scope; they are not a claim that browser, vector or live-owner qualification passed.

## Global Constraints

- “Create one root `backend/` containing the Express HTTP application, controllers, routes, schemas, SQL models, services, middleware, database tooling and backend runtime modules.”
- “Keep `packages/contracts` as the shared frontend/backend schema boundary and keep frontend packages outside `backend/`.”
- “Use JavaScript ES modules for the requested `server.js`, Express layers and middleware. Preserve TypeScript in existing reusable modules during relocation.”
- “Retain versioned `/api/ui/v1` paths, command IDs, revision checks, SSE event shapes and capability projection.”
- “No user RBAC is introduced.” Do not manufacture an admin identity or remove action approvals to satisfy compatibility.
- Preserve migration bytes/checksums and database data. No production migration, populated-store conversion, provider spend or deployment is included.
- Preserve OpenClaw work and imported upstream source. Synthetic/unconfigured backend operations remain hidden.
- Extend normal ASI architecture/dependency/type/test enforcement to `backend/`; do not exclude it from those checks.
- Preserve legacy SQLite episode authority until an independently tested PostgreSQL conversion exists. This plan relocates its code; it does not silently replace its storage behavior.

## Review Focus

1. Relocated source bypasses import/credential ownership checks because the scanner recognizes only `apps/` and `packages/`: add backend-path negative fixtures before moves (Task 1).
2. Express body parsing consumes upload bytes, exposes parser errors, or changes error/status semantics: raw upload parsing and contract parity tests (Tasks 3–4).
3. Transactions switch pool clients, leak after abort, or use runtime DDL to hide missing pgvector: actual PostgreSQL rollback/readiness tests (Task 5).
4. SSE disconnects, replay retries and shutdown cause late writes or duplicate commands: real HTTP and lifecycle tests (Tasks 4, 7).
5. Healthy Express server promotes synthetic ports to live or breaks the OpenClaw adapter: unchanged discovery/session contract and browser checks (Tasks 6–7).

## File map and explicit relocation inventory

**New root package:** `backend/package.json`, name `@asi/backend`, with Node ESM entry `backend/server.js`, importable `backend/app.js`, JSDoc/checkJs config, and dependency injection at the app boundary.

**Backend modules:** Move the following existing directories from `packages/<name>` to `backend/modules/<name>` without changing package names: `audit`, `budgets`, `channels`, `context`, `control`, `episodic`, `gateway`, `identity`, `memory`, `models`, `orchestrator`, `policy`, `privacy`, `protocols`, `sandbox`, `skills`, `specialists`, `telemetry`, `tools`.

**Backend worker packages:** Move existing `apps/<name>` to `backend/workers/<name>` for `episodic-owner`, `gateway`, `memory-broker`, `orchestrator`, `policy-kernel`, `privacy-router`, `specialist`, `tool-engine`. The gateway's legacy Hono entry remains temporarily for parity; final active HTTP ownership is `backend/app.js` and `backend/server.js`.

**Keep in place:** `packages/contracts`, `packages/ui`, `apps/web`, `apps/openclaw`, `apps/gateway-fixture`, frontend tests, and `third_party/openclaw`. The synthetic Gateway fixture is a test/demo dependency, not the active Express service.

**Database:** Destination `backend/database/migrations/postgres` and `backend/database/migrations/sqlite`. Canonical runner becomes `backend/database/migrate.js`; `scripts/apply-migrations.mjs` remains a compatibility re-export/CLI bridge after preserving its current local changes.

**HTTP layer files:** `backend/config/{env,database,logger}.js`; `backend/middlewares/{request-context,session,origin-csrf,validate,rate-limit,not-found,error-handler}.js`; `backend/routes/{index,health,session,conversation,run,interaction,upload,catalog,memory,activity,settings,command}.routes.js`; corresponding `.controller.js` files; `backend/services/{capabilities,conversation,catalog,memory,run,interaction,upload,settings,command}.service.js`; request schemas and SQL models only where the actual service owns that operation.

**Owner rule:** HTTP services may consume domain ports but must not become a second database writer. Existing control/audit/budget/policy/memory owners keep their SQL; `backend/models/*.model.js` is a public repository layer over those owners where they exist, not permission to copy their SQL into a new implementation.

## Task 1: Protect the migration with source mapping and enforcement tests

**Files:** Create `docs/decisions/0005-express-backend-layout.md`, `backend/RELOCATION.json`, `tests/architecture/backend-layout.test.ts`, negative fixtures under `tests/fixtures/architecture/backend-layout`; modify `docs/architecture-baseline.json`, `scripts/verify-architecture.mjs`, `scripts/verify-dependencies.mjs`, `pnpm-workspace.yaml`, root test/type configuration when necessary.

**Interfaces:** `RELOCATION.json` records `{schemaVersion:1,moves:[{from,to,packageName,componentId}]}` for every explicit inventory item. Component classification uses longest matching owned path, including trusted DB bootstrap versus HTTP controllers. Unmapped production backend paths are violations; `backend/workers` participates in cross-app checks, and `backend/modules` participates in package-to-app and store-owner restrictions.

- [ ] Record current `git status`, source/migration hashes and baseline checks. Preserve existing untracked OpenClaw adapter/tests and the modified migration runner. Do not assume files from earlier turns are unchanged.
- [ ] Add fixture assertions that a backend controller importing `pg`, a worker importing a provider SDK outside privacy, an executable worker obtaining a privileged database constructor, a module importing a worker, and an unclassified backend source file are rejected. Add clean fixtures for intended domain ports. Existing app/package fixtures must keep passing.
- [ ] Run `pnpm exec vitest run --project unit tests/architecture/backend-layout.test.ts`; observe the missing backend enforcement before implementing it.
- [ ] Add root workspace patterns `backend`, `backend/modules/*`, `backend/workers/*`. Extend scanners and baseline component paths without adding a blanket backend exemption. New paths retain their original component owners; register the Express HTTP facade and each shared infrastructure file explicitly.
- [ ] Rerun new fixtures plus `tests/architecture/imports.test.ts`. Record the approved framework/folder decision in the new ADR without changing historical approvals or declaring old tasks newly complete.
- [ ] Review and commit only Task 1 files after GREEN.

## Task 2: Implement the Express application/server foundation

**Files:** Create `backend/{package.json,app.js,server.js,jsconfig.json,.env.example,README.md}`, `backend/config/{env,logger}.js`, health routes/controller, request-context/rate-limit/not-found/error middleware, `backend/tests/{config,server,http-foundation}.test.js`. Update root scripts, dependency inventory and lockfile.

**Interfaces:**
- `loadConfig(env:NodeJS.ProcessEnv):BackendConfig` validates host/port, private DB configuration, exact allowed origins, bounded pool/timeouts and explicit mode. Defaults host to `127.0.0.1`; no wildcard proxy trust or credentials in diagnostic output.
- `createApp({services,sessions,capabilities,config,logger}):Express` installs HTTP wiring but never listens, opens a DB or starts a worker on import.
- `startServer({app,config,resources}):Promise<{address,close}>` owns listening and bounded shutdown. CLI `node backend/server.js` loads config and built module composition.
- `GET /health` and `/health/live` return safe liveness JSON compatible with the adapter's `status:'ok'`; `GET /health/ready` returns 200 only when required PostgreSQL/vector/domain readiness passes, otherwise 503. Health never enables product capabilities.
- `backend:dev`, `backend:build`, `backend:typecheck`, `backend:test`, `backend:start` are explicit root commands; preserve current frontend/demo startup commands until cutover validation.

- [ ] Write tests for import without listener side effects, invalid configuration, occupied port, safe error serialization, request-ID propagation, independent liveness/readiness and idempotent shutdown. Assert secrets never appear in response/log captures.
- [ ] Run the focused Vitest suite to establish RED.
- [ ] Resolve exact compatible pins for Express 5, Helmet, express-rate-limit, Pino/pino-http, pgvector and cookie-parser only if used. Inspect official metadata/engines and inventory before installation; retain current pg/Zod pins. No ORM, Redis, generic CORS or process-manager dependency is introduced for scaffolding alone.
- [ ] Implement the foundation with Node builtins for environment/UUID/abort/lifecycle, Helmet headers appropriate to the UI and explicit local rate-limit settings. Do not globally compress SSE or trust forwarded headers by default.
- [ ] Run focused tests, `pnpm backend:typecheck`, frozen install validation and dependency checks. Ensure root typecheck/test scripts include backend JavaScript with checkJs and backend test globs.
- [ ] Review and commit only this task's files.

## Task 3: Port session, schema and request middleware to Express

**Files:** Create session routes/controller and `middlewares/{session,origin-csrf,validate}.js`; add `backend/schemas/{session,conversation,interaction,upload,memory,activity,command}.schema.js`; create `backend/tests/{session,validation,upload-parsing}.test.js`.

**Interfaces:** `requireSession(sessions)`, `requireOriginAndCsrf(config)`, `validate({body?,query?,params?})` are Express middleware factories. Existing compiled session/domain ports remain injected; controller signatures are standard `(req,res,next)` and receive parsed safe inputs. Session protection is not user RBAC.

- [ ] Add actual HTTP tests for missing/expired session, invalid assertion, wrong origin, missing/mismatched CSRF, revoke/logout and cookie flags. No hard-coded demo assertion appears in active bootstrap.
- [ ] Add JSON parser tests for malformed/oversized payloads with safe existing normalized errors and no leaked stack/body. Test raw upload bytes arrive unchanged, and file payloads cannot bypass byte limits through content-type selection.
- [ ] Run focused tests RED, then implement Express 5 middleware ordering: request context/headers, exact route-specific parsing, session and origin/CSRF checks, validation, handler, not-found and final error handler. Reuse runtime schemas from `@asi/contracts`.
- [ ] Retain existing API input limits and error envelopes; do not use Express defaults as an undocumented contract change. Model missing local-session bootstrap honestly rather than issuing a fake user/admin identity.
- [ ] Rerun tests against Express and affected legacy UI security/contract cases. Commit after owned checks pass.

## Task 4: Port domain routes/controllers/services and SSE without changing wire behavior

**Files:** Remaining route/controller/service files listed in the file map; `backend/schemas/*.schema.js`; `backend/utils/{errors,sse}.js`; `backend/tests/{api-parity,events,commands}.test.js`; adapt existing Gateway HTTP contract harness to accept an Express server factory.

**Interfaces:** `createBackendServices(ports)` exposes named conversation, run, interaction, upload, catalog, memory, activity, settings and command use cases. Services call existing owners; controllers translate HTTP only. Preserve all paths under `/api/ui/v1`, response schemas, revisions, idempotency keys and event ordering. Capabilities use the existing shared provider schema and readiness factory.

- [ ] Parameterize relevant contract cases against legacy Hono and new Express factories; tests assert identical status/body/cookie semantics for implemented operations. Use existing canonical fixtures and do not freeze synthetic results as live acceptance.
- [ ] Test create/list/patch/snapshot/message, cancellation, separate answer/approval endpoints, upload lifecycle, catalogs, memory/activity/settings and management commands. Cover absent owners and read-versus-mutation capability separation.
- [ ] Add real HTTP SSE tests for event framing, valid cursor replay, malformed cursor handling, duplicate/gap behavior, disconnected clients and cleanup. Verify aborted requests do not retain listeners/timers or publish into another conversation.
- [ ] Run tests RED, then implement routes as native Express routers. Do not mount the old Hono fetch app behind Express. Use port-backed services and safe schemas; no controller calls a provider or database directly.
- [ ] Preserve current memory-only/absent-owner capability states. A successful endpoint or healthy HTTP server must not imply live product functionality.
- [ ] Rerun parity/SSE tests, strict backend checks and `tests/openclaw/{transport,events}.test.ts`. Commit only after wire compatibility is demonstrated.

## Task 5: Consolidate migration tooling and PostgreSQL/pgvector bootstrap

**Files:** Create `backend/config/database.js`, `backend/database/{transaction,migrate}.js`, move SQL files to the destination paths in the map; preserve `scripts/apply-migrations.mjs` as compatibility entry; add `backend/models/vector.model.js`, `backend/tests/{postgres,vector,migration-relocation}.test.js`; update current migration registry/path consumers without changing migration identity/checksums.

**Interfaces:**
- Trusted bootstrap resolves owner-specific database resources through existing owner factories. `database.js` is explicitly classified as trusted composition; HTTP controllers/untrusted workers never receive its pool.
- `withTransaction(pool,work,{signal?}):Promise<T>` uses exactly one checked-out client for BEGIN/work/COMMIT or ROLLBACK and releases it in finally. Bound connection/query timeouts; cancellation rejects before dispatch when possible and records uncertain effects through existing owners.
- `databaseReadiness():Promise<{postgres:boolean,vector:boolean}>` performs bounded safe probes without DDL. Migrations run only through explicit trusted owner configuration.
- `searchVectors(input)` validates finite numeric vector values, exact configured/model dimensions, scoped query filters and bounded limit; parameterizes vector/distance queries using the official pgvector integration. Existing `VECTOR(1536)` requires 1536 values until a separately reviewed schema change.

- [ ] Capture SHA-256 for every current PostgreSQL/SQLite migration and the current locally modified runner; plan compatibility before editing either. Do not stage another writer's changes as this task's work.
- [ ] Add disposable-PostgreSQL tests for commit/rollback using one client, failed acquisition, transaction callback failure and pool release. A runtime-role missing-extension case reports not-ready and performs zero `CREATE EXTENSION` calls.
- [ ] Add vector tests for scope-qualified nearest-neighbor correctness, dimension/model mismatch, NaN/infinity rejection and no embedding generation/provider call. No existing populated memory schema is rewritten.
- [ ] Run database tests RED, then relocate byte-identical SQL and preserve registry DAG, advisory lock, checksum journal and rollback behavior in the canonical runner. Keep existing script exports/CLI working during the move.
- [ ] Verify old and new runner entry points produce identical plans/checksums and run fresh disposable schema qualification. Execute extension provisioning only in that explicitly disposable fixture through its migration owner.
- [ ] Record environment-dependent blocked checks honestly. Retain legacy SQLite integration/backup assumptions and do not delete live files. Commit only after required available owner checks pass.

## Task 6: Relocate backend packages and workers in dependency order

**Files:** Explicit modules/workers in the inventory; their manifests, tsconfigs and internal references; root `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, scripts/launcher paths, dependency inventory and architecture baseline. Update active source tests and runbooks that reference moved files; preserve historical evidence snapshots.

**Interfaces:** Preserve each `@asi/*` package name, export subpath, public type and compiled `dist` structure. Adjust tsconfig `extends` paths for the additional directory level. Root aliases map actual backend source paths while shared `contracts`/`ui` retain existing paths. No duplicate package names coexist in the workspace.

- [ ] Read the relocation inventory and identify non-package relative-path consumers with `rg`, including SQL fixtures, architecture checks, scripts, Playwright and worker CLI entry guards. Add a relocation test for exported package identities/subpaths and legacy launch compatibility.
- [ ] Move one dependency group at a time: independent support/identity -> control/governance -> memory/episodes/privacy/models -> tools/protocols/skills/context -> orchestration/channels/specialists -> worker entry points. Resolve actual manifest dependencies rather than assuming this summary is a topological proof.
- [ ] Update package/test/build aliases after each group, then run its original owned tests and compiler checks. Keep all test assertions and source owner classifications. Package-internal test fixtures relocate with their package.
- [ ] Preserve process isolation and credential boundaries; `workers/privacy-router`, `policy-kernel` and tool workers remain distinct trusted/untrusted roles. Do not pass a root Express pool or signing configuration into tools.
- [ ] Make legacy backend application entry points thin launch/export compatibility bridges only where a current consumer needs them. Do not preserve two competing canonical source trees. Replace the active HTTP launch target with Express only after Task 4 parity passes.
- [ ] Rerun frozen install, full workspace build/typecheck, original unit suite, affected worker/integration checks and backend architecture negative fixtures. Review and commit each qualified move group separately.

## Task 7: Connect OpenClaw to Express and verify operational behavior

**Files:** Update active OpenClaw proxy/launcher configuration, `playwright.openclaw.config.ts`, `backend/README.md`, root README/scripts; add `backend/tests/{shutdown,openclaw-http}.test.js` and browser scenarios under `tests/openclaw/browser/`.

**Interfaces:** The frontend still calls relative `/health` and `/api/ui/v1` paths. Connected proxy targets the Express listener on loopback, with the existing exact allowlist, not a new OpenClaw Gateway. `node backend/server.js` is the canonical backend entry after required module builds; `close()` stops admission, aborts/drains bounded work, closes streams/listeners, then releases domain resources/pools.

- [ ] Add browser/HTTP tests proving the actual listener is Express while existing typed adapter schemas still pass. Unsupported/synthetic services remain hidden; a valid connection does not create a user role or enable generation.
- [ ] Exercise missing DB, missing vector extension, unavailable policy/owner, rate limit and server restart; show scoped readiness/connection errors without fixture fallback. Test default connection-only behavior if no live product owner exists.
- [ ] Add shutdown tests during active SSE and pending requests; verify only owned child processes stop and no new command is accepted during draining. Preserve persistent idempotency/outbox/lease semantics through existing owner checks.
- [ ] Run real browser desktop/mobile checks and applicable accessibility checks against the Express launch command. Preserve old demo launch behavior for explicit demo use.
- [ ] Update documentation with exact build/start/migrate/test commands, current enabled operations, absent services and pgvector provisioning requirements. Do not claim that reorganizing files made mocked models real.

## Task 8: Final regression, security and source-integrity review

**Files:** `docs/release-evidence/express-backend-migration.md`, relocation ADR/manifest, relevant current runbooks and README.

- [ ] Run root lint/type/build, backend checkJs/tests, affected original module tests, Express parity/security/SSE tests, OpenClaw transport/browser checks, architecture/dependency/traceability checks and upstream import integrity. Include disposable PostgreSQL/vector qualification where the environment is available.
- [ ] Verify migration bytes/checksums against Task 5 capture; verify package exports and source paths against `RELOCATION.json`; confirm no unclassified backend source or controller/database/provider bypass passes scanners.
- [ ] Inspect final diff and `git diff --check`. Exclude unrelated local work; report pre-existing failures separately without suppressing tests or promoting qualification.
- [ ] Retain unresolved backend capabilities as unavailable/hidden. Report which checks actually ran, whether a genuine product workflow is live, and any remaining database/isolation/provider prerequisite.
- [ ] Only after parity and owner checks pass, remove unused Hono dependencies from the active Express service's closure. Keep dependencies still consumed by explicit demo/legacy packages; no blanket uninstall or data deletion.

## Self-review and execution handoff

- Coverage: folder/framework/enforcement (1–2), schema/middleware (3), routes/controllers/services/SSE (4), PostgreSQL/vector/migrations (5), actual source consolidation (6), OpenClaw/shutdown (7), honest final evidence (8).
- Review Focus cases are assigned to concrete tests in their owning tasks.
- The plan does not introduce a new ORM, missing agent capabilities, user RBAC or a destructive SQLite/data conversion. Physical organization changes preserve logical service ownership.
- Recommended execution is native sequential in this chat: migrations, imports, package manifests and API compatibility share state and must be verified in order. Review this plan before implementation under the active writing-plans workflow.
