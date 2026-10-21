# ASI microservices backend build plan

Date: 2026-10-21. Status: proposed build plan; no implementation or deployment started.

## Goal and architecture

Build eight independently testable, versioned and deployable services in the existing monorepo, using Node.js, Express, PostgreSQL, pgvector and the existing Redis/BullMQ stack. Preserve the public frontend API and current governance boundaries. No user RBAC is introduced.

This is the execution companion to the [architecture proposal](2026-10-21-asi-microservices-migration.md) and [model ownership map](../../asi-microservices-model-ownership.md). The existing 19 domain packages and eight worker applications are implementation inputs, not proof that the target services already work.

Build each service as a complete slice: models and stored-record validation → domain logic → request schemas/controllers/routes → transport clients → integration/security tests → operational packaging. A service's data-layer completion and a feature's full acceptance remain distinct.

## Service catalog

Ports are proposed local defaults, configurable and checked for availability before startup. Do not stop an unrelated process to obtain a port.

| Service | Workspace package | Local port | Durable store | Main responsibility |
| --- | --- | --- | --- | --- |
| API Gateway | `@asi/service-api-gateway` | 4400 | None directly | Public UI API, session/CSRF/origin handling, safe projections/SSE and channel adapters |
| Core | `@asi/service-core` | 4410 | Private PostgreSQL `asi_core`; trusted artifact storage | Identity/grants, policy, budgets, audit, runs/leases/effects, outboxes and durable metadata |
| Memory | `@asi/service-memory` | 4420 | Private PostgreSQL `asi_memory` with pgvector | Scoped vector/relational memory, revisions, branches and observation graph |
| Episode | `@asi/service-episode` | 4430 | Exclusive local SQLite storage | Transcript/episode append, search, replay and compression lineage |
| Inference | `@asi/service-inference` | 4440 | No domain database initially | Privacy eligibility, provider routing, generation/embedding and usage reporting |
| Orchestrator | `@asi/service-orchestrator` | 4450 | Canonical workflow state via Core | Plans, context, task dispatch, recovery and bounded reasoning |
| Tool Runtime | `@asi/service-tool-runtime` | 4460 | Canonical effects via Core | Verified tools, isolated execution, exact results and MCP/A2A adapters |
| Specialist | `@asi/service-specialist` | 4470 | Canonical tasks/results via Core | Bounded browser/data/coding/research workers and measured eligibility |

Core initially keeps identity/policy/budgets/audit and run/effect coordination together. Their coordinated transaction rules must be defined and tested before contemplating a later split. Stateless services do not receive a database just to make every folder identical.

## Directory and ownership rules

```text
backend/services/<service>/
  package.json
  server.js
  .env.example
  src/
    app.js
    config/
    models/
    schemas/
    controllers/
    routes/
    services/
    middlewares/
  database/migrations/    # Store-owning services only
  tests/
  README.md

packages/contracts/src/services/   # Pure HTTP/event schemas and types
packages/service-clients/src/      # Typed transport clients, no domain authority
tests/services/                    # Cross-process/contract/failure tests
infra/windows/                     # Per-service lifecycle and release config
docs/service-catalog/              # Ownership, operations and contract versions
```

Existing modules remain in place until their service packages consume them correctly. Move private source only after a working service slice passes. In particular, split the mixed gateway/skills packages by ownership instead of giving multiple services access to their SQL-writing implementations.

Services may import their own domain modules, pure contracts and transport clients. They may not import another service's models, controllers, runtime entry, provider SDKs or private repositories. Data access is through the owning service, with separate database credentials. Preserve logical ASI component classifications inside services; do not broadly allow every new service path to import every package.

## Common contracts and runtime interfaces

Define these before building the first network dependency:

- `createApp({config,owners,clients,logger})`: returns an Express app without binding a listener or loading secrets at import time.
- `startServer({app,config,resources})`: binds one owned listener and returns `{address,close}`. `close()` is idempotent, drains bounded work and closes only owned resources.
- Public browser routes remain `/api/ui/v1`. Internal owner routes use `/internal/v1`; no wildcard proxy exposes them to the browser.
- `/health/live`: the service process can respond. `/health/ready`: dependencies required by that service are usable. Capabilities are separately projected per operation; liveness never enables a feature.
- Internal mutations carry authenticated service identity/audience, delegated principal context, request/correlation ID, caller deadline, command/idempotency ID and payload digest. Each receiver validates identity and tenant rather than trusting forwarded headers.
- Shared clients validate response schemas, bound bodies, propagate cancellation/deadlines and return existing normalized safe error codes. Retry only safe reads or demonstrated durable-idempotent mutations, with the same key/digest. Unknown external effects require reconciliation.
- Every new queue message has a version, producer, tenant, event/aggregate ID and version, correlation/causation IDs, timestamp and payload reference/digest. Sensitive data/credentials do not become queue payloads.
- Metadata requests use bounded schemas; artifact uploads and inference streams use separately bounded streaming contracts. Preserve current public message/upload limits rather than weakening them for extraction.

Keep third-party versions pinned to current qualified workspace versions. New versions/libraries require actual qualification; this plan does not authorize an unexamined framework, ORM, broker or platform replacement.

## Work packages

### MS01 — Baseline, ownership and enforcement

**Deliverables:** `docs/service-catalog/services.json`, service source/dependency graph, stored-table/function/credential inventory, negative architecture fixtures and a migration qualification ledger separate from the feature ledgers.

- [ ] Record the current build/type/lint/backend test results and existing failures. Capture SQL hashes and preserve unrelated local work.
- [ ] Map every existing module/worker, all 43 proposed model families and all 50 unfinished task IDs to service ownership. Keep original Task 30 and V2-G01 as integration gates, not CRUD services.
- [ ] Add tests rejecting cross-service private imports, unauthorized SQL/provider imports, unmapped source and credentials outside the owner.
- [ ] Add `backend/services/*` and `packages/service-clients` to workspace/build/test discovery with explicit logical-component ownership. Do not scaffold eight empty services merely to satisfy file-count checks.

**Done when:** coverage and negative tests pass; each table has one authoritative writer and each privileged credential has a named owner.

### MS02 — Contract package and service clients

**Files:** `packages/contracts/src/services/{common,core,memory,episode,inference,orchestrator,tool-runtime,specialist}.ts`, `packages/service-clients`, `tests/services/contracts`, `tests/services/clients`.

- [ ] Define concrete request/result schemas for the first Core session/goal/conversation slice, then the later service contracts listed in the architecture proposal. Reuse existing domain/UI schemas without duplicating their definitions.
- [ ] Define protocol/contract version compatibility, normalized unavailable/unknown errors and idempotency/digest behavior. Do not infer successful operations from a health response.
- [ ] Implement bounded HTTP clients with explicit per-service configuration. Keep service credentials separate from browser cookies; never blindly forward cookie/authorization headers to arbitrary targets.
- [ ] Test wrong versions/audiences, invalid JSON, oversized responses, timeouts, cancellation, reused keys with changed payloads and safe error redaction.

**Done when:** contract/consumer tests pass without starting all services; tests are clearly fixtures and do not claim live owner qualification.

### MS03 — Windows lifecycle and integration fixtures

**Files:** `scripts/run-services.mjs`, `infra/windows/services.example.json`, `tests/services/runtime`, `tests/services/fixtures`.

- [ ] Implement selected-service startup using explicit dependency order, availability checks, per-service logs and readiness deadlines.
- [ ] Track owned child PIDs and stop only those processes. On startup failure, clean up owned listeners/pools/children; do not kill unrelated Node/PostgreSQL processes.
- [ ] Create disposable PostgreSQL fixtures with schema-owner/runtime-role separation and unique local Episode storage. Never migrate the existing user database.
- [ ] Qualify the existing Redis/BullMQ runtime on Windows or an explicitly permitted VM. Preserve Windows-first release scope; do not assume Docker/Kubernetes/Linux.
- [ ] Create a Node-environment `services` test project and service-specific build/test scripts. Missing required real infrastructure fails its integration gate rather than producing a green skip.

**Done when:** start, readiness failure, repeated stop, occupied-port and resource-cleanup tests pass. A production Windows Service adapter remains a release deliverable, not a property of running Node.

### MS04 — Core service: first durable vertical slice

**Source:** control, identity, policy, budgets, audit; existing shared goal/run/session/UI contracts. **Target:** `backend/services/core`.

- [ ] Compose the current owners inside Core with private database/signing configuration. No hardcoded administrator, synthetic principal or new user RBAC.
- [ ] Implement a trusted local-workspace authentication bootstrap against the actual identity owner and a durable browser-session port. Missing bootstrap remains unavailable, not an anonymous live workspace.
- [ ] Implement/reuse durable conversation and goal models with revision checks, command idempotency and tenant-bound queries. Existing in-memory UI ports remain test-only.
- [ ] Add authenticated internal session, conversation and goal endpoints and their typed client methods.
- [ ] Exercise actual PostgreSQL constraints, current grants, safe reads, altered-payload conflict, stale revision, runtime-role isolation and restart recovery.

**Done when:** an authenticated client can persist/read one conversation/goal over the actual Core listener, restart Core and obtain the same authorized state; duplicate commands do not duplicate records.

### MS05 — Core service: transaction and metadata completion

- [ ] Specify the exact transaction boundaries for claim/renew/checkpoint/cancel, policy/approval checks, atomic budget reservation, execution preparation/begin/report and outbox writes.
- [ ] Wrap the existing owner operations behind internal commands while preserving writer fencing and current grant checks. Do not replace one coordinated mutation with several unrelated network calls.
- [ ] Implement Core-owned model families from the ownership map: plans/projects/agent metadata, skills catalog/trust, approvals/grants/budgets/audit projections, schedules, task/effect records, artifacts and evidence/report metadata.
- [ ] Store artifact bytes through bounded authenticated transfer, trusted digest/size validation and staged registration. Do not claim database/file writes are a single transaction.
- [ ] Keep candidate, simulation, compensation and release records as metadata. Storing one never deploys, approves, executes or creates a capability.

**Done when:** real concurrent lease/budget/approval/idempotency tests pass, stale writers cannot dispatch/publish, and an unknown effect is reconciled before retry. Original feature completion still requires its full acceptance.

### MS06 — API Gateway service

**Source:** root Express application, UI adapters, channels. **Target:** `backend/services/api-gateway`.

- [ ] Move public routes, parser ordering, safe projections, session cookies, origin/CSRF protection, limits, request identity and SSE handling into the Gateway.
- [ ] Replace local domain calls with typed owner clients. Keep Core/memory SQL credentials, policy signing keys and provider credentials out of Gateway.
- [ ] Preserve `/api/ui/v1`, existing UI DTOs, command/revision semantics and replay cursors. Keep unsupported/synthetic/unconfigured operations hidden.
- [ ] Add a temporary root `backend/server.js` compatibility launcher targeting Gateway after parity passes. Keep explicit synthetic demo launch behavior clearly separate.
- [ ] Test the actual Gateway→Core network path, stream disconnect, upstream timeout/unavailability, wrong session/CSRF and safe failure output.

**Done when:** the existing frontend API works for the qualified durable slice through Gateway and Core, with no local-memory fallback or public exposure of internal routes.

### MS07 — Memory service

**Source:** memory module/broker and scoped lifecycle/branch/observation requirements. **Target:** `backend/services/memory`.

- [ ] Create owner-local migrations and a restricted `asi_memory` runtime role. A minimal local tenant provisioning projection supports local foreign keys; it does not become authentication authority or import the Core schema.
- [ ] Install/provision the PostgreSQL-version-compatible pgvector extension explicitly in qualification fixtures. Application runtime does not run extension DDL.
- [ ] Implement/reuse memory CRUD/revision/lifecycle, finite 1536-dimensional vector validation, branch queries and bounded scoped observation graph traversal.
- [ ] Resolve the existing observation-bootstrap issue through reviewed new owner-local migrations while preserving original SQL history/checksums.
- [ ] Test actual nearest-neighbor results, model/dimension mismatch, every-hop tenant/role/private filtering, expiry, CAS and cross-service reference verification.

**Done when:** a separate process/database passes real pgvector and runtime-role tests; no other service has its database credentials. Missing extension remains a failed readiness/qualification result.

### MS08 — Episode service

**Source:** episodic module/owner. **Target:** `backend/services/episode`.

- [ ] Expose authenticated idempotent append, session search/transcript, ordered replay, compression lineage and reconciliation endpoints.
- [ ] Retain exclusive SQLite ownership with local ACL-controlled storage outside OneDrive/network/sync folders. Preserve recorded episode authority and cursors.
- [ ] Integrate Core references and Gateway transcript projection through contracts. Do not let another service mount/open the same WAL file.
- [ ] Test restart/replay, duplicate append, sequence gaps, crash recovery, backup/restore and unauthorized session access.

**Done when:** one qualified owner preserves real transcript state across restart; horizontal scaling remains disabled until session-shard ownership is explicitly implemented and tested.

### MS09 — Inference service

**Source:** privacy, models and privacy-router. **Target:** `backend/services/inference`.

- [ ] Expose governed generation/embedding and qualified provider/model catalog contracts. Keep provider credentials only in trusted Inference configuration.
- [ ] Apply privacy eligibility before model scoring/routing. Require current Core authorization and approved budget/usage bindings.
- [ ] Implement bounded streaming, cancellation, normalized failures and conservative unknown-usage reconciliation.
- [ ] Add actual provider integration only for an explicitly configured approved test workload, data policy and spending limit. Complete independent contract/security work without inventing those inputs.

**Done when:** required provider calls are real and governed, forbidden fallbacks fail, and usage reconciles without overspending. Mocked generation does not qualify this service as live.

### MS10 — Transactional dispatch and event delivery

**Files:** owner-local outbox/inbox implementations, Redis queue configuration, `tests/services/events`.

- [ ] Commit authoritative state and outbox records in the same owner transaction, then publish through an independent relay.
- [ ] Define named producers/consumers and Redis ACLs. Use separate delivery queues for independent subscribers; one work queue is not fan-out.
- [ ] Persist duplicate/digest/order checks in the consumer's store or the authoritative Core command/effect record. Redis job IDs alone are not durable domain idempotency.
- [ ] Bound retries, concurrency, backpressure and dead-letter/reconciliation states. Acknowledge only after the authoritative state transition commits.
- [ ] Crash before/after commit/publication/acknowledgement and deliver duplicate/reordered/conflicting events. Verify no dropped committed command or duplicate effect.

**Done when:** broker restart/outage and at-least-once delivery preserve durable work and honest unknown outcomes. No exactly-once external-effects claim is made.

### MS11 — Orchestrator service

**Source:** orchestrator/context and pure skill selection. **Target:** `backend/services/orchestrator`.

- [ ] Execute only Core-bound goals/plans/tasks, using current leases, revisions, deadlines, grants and shared budgets.
- [ ] Assemble context through scoped Memory/Episode/Core clients and call Inference through its governed interface.
- [ ] Implement bounded decomposition, retry/recovery, critique, comparison and debate with source-contract caps. Store reports through Core, not a private shared SQL import.
- [ ] Dispatch through durable outbox/queue contracts. Resume from canonical checkpoints; unknown external results select reconciliation.
- [ ] Test cancellation, lease loss, repeated messages, stale plans, interrupted checkpoints and budget exhaustion across real processes.

**Done when:** a restarted orchestrator resumes the same bounded plan without duplicating an effect or treating unknown verification as success.

### MS12 — Tool Runtime service and isolation

**Source:** tools, protocols, tool-engine and sandbox. **Target:** `backend/services/tool-runtime`.

- [ ] Expose trusted manifest verification/registration, no-effect preview, exact governed execution and execution-result/status contracts.
- [ ] Use Core execution preparation/begin/report identities bound to input/artifact digest, lease epoch, current grant/policy, budget, audience and expiry.
- [ ] Qualify the actual Windows-reachable isolation backend before executable handlers run. Neither Node worker processes nor mocked sandbox success qualifies untrusted execution.
- [ ] Keep trusted host credentials and scoped execution bindings outside untrusted handlers. No provider/identity signing/Core database credentials enter task payloads.
- [ ] Integrate MCP/A2A adapters only under existing reviewed scope. Test sensitive approvals, path/network restrictions, revocation/cancellation and interrupted unknown external effects.

**Done when:** the real isolated execution and protocol/security prerequisites pass. Until then, the service can serve verified metadata/preview only and reports executable operations unavailable.

### MS13 — Specialist service

**Source:** specialists and specialist worker. **Target:** `backend/services/specialist`.

- [ ] Consume bounded typed tasks with current Core assignment/grant/deadline/budget bindings and produce canonical TaskResult/evidence/artifact references.
- [ ] Implement browser/data/coding/research profiles from the model catalog, with their existing domain/path/query/command/source restrictions.
- [ ] Rank workers from current eligibility and measured versioned evidence; a high score cannot override missing health/grants/capacity/policy.
- [ ] Call governed Inference/Tool Runtime and scoped data owners; do not invoke provider SDKs or open another service's database directly.
- [ ] Test duplicate tasks, stale assignment, cancelled parent, malicious instructions, unauthorized file/network access and exact result provenance.

**Done when:** representative real qualified tasks pass without credential leakage or authority widening; unsupported specialist profiles remain unavailable.

### MS14 — Complete model coverage and per-feature backlog

- [ ] Verify all 43 model families exist in their assigned services with real owner-backed behavior, stored-record validation, and tests; pure projections do not acquire unnecessary SQL tables.
- [ ] Record new and reused repositories, authoritative tables, contract versions, migration provenance and required qualification results per service.
- [ ] Preserve the 50-task coverage map. Model completion never changes an original/V2 feature status until that task's complete source acceptance passes.
- [ ] Execute remaining feature work as service-owned slices, including experimental candidates/simulation/version/release metadata and their later independent execution/promotion gates.
- [ ] Keep original Task 30/V2-G01 as real cross-service acceptance. Do not claim all ASI functionality is complete because all service packages build.

**Done when:** the data-layer coverage report has no missing/duplicate family and the feature backlog honestly distinguishes implemented, qualified, unavailable and pending work.

### MS15 — Cutover, independent release and final acceptance

- [ ] Preserve legacy routes while switching one qualified operation at a time to the new owner. Rehearse data copy, checksum verification, bounded write freeze and single-writer cutover on disposable targets.
- [ ] Preserve existing applied migration history. New owner-local databases use truthful bootstrap histories and source-provenance mappings, not falsely recorded legacy migrations.
- [ ] Build/package/version each service independently. Add compatible producer/consumer rollout checks, authenticated TLS/mTLS, per-service Windows lifecycle, ACLs, secrets rotation, logs and backup/restore runbooks.
- [ ] Rehearse rollback after new writes: use a compatible old application against the current owner or an explicitly tested reverse migration; do not silently switch to a stale database backup.
- [ ] Restart/upgrade one service while compatible peers remain deployed; stop Memory/Redis/Inference independently and prove bounded degradation without synthetic success.
- [ ] Run a genuine non-demo browser goal→plan→governed task→real artifact→independent verification→delivery workflow, including crash/restart, cancellation, unknown outcomes and an unsupported claim that remains unknown/unmet.
- [ ] Run required architecture/dependency/type/lint/build/contract/security/integration/browser/upstream-integrity checks and `git diff --check`. Existing UI evidence/protected-file failures must be resolved or explicitly remain failed release gates; never suppressed.

**Done when:** service isolation, independent deployment, recovery, actual data security and the agreed real workload pass. Unfinished original/V2 acceptance remains visible rather than being promoted by a migration label.

## Execution dependencies

```text
MS01 → MS02 → MS03 → MS04 → MS05 → MS06
MS03/MS04 ──────────────────────→ MS07 Memory
MS03/MS04 ──────────────────────→ MS08 Episode
MS04/MS05 ──────────────────────→ MS09 Inference
MS05/MS03 ──────────────────────→ MS10 Dispatch
MS06/MS07/MS08/MS09/MS10 ────────→ MS11 Orchestrator
MS05/MS10 + isolation ──────────→ MS12 Tool Runtime
MS11/MS12/MS09 ─────────────────→ MS13 Specialist
MS04–MS13 ──────────────────────→ MS14 Coverage → MS15 Release
```

Memory/Episode/Inference contracts can be developed independently once MS02/MS03 pass; their live qualification still waits for actual required owners. Dependency arrows do not authorize parallel agents or change the established sequential execution preference.

## Planned developer commands

These commands are deliverables of MS01–MS03, not commands already available today:

```powershell
pnpm services:dev -- core api-gateway
pnpm --filter @asi/service-core build
pnpm --filter @asi/service-core test
pnpm --filter @asi/service-core start
pnpm services:test:contracts
pnpm services:test:integration
pnpm services:verify
```

`services:verify` discovers every required service/test, rejects empty green suites and reports unavailable live dependencies honestly. Run full builds and integration tests sequentially on the current Windows machine to avoid the previously observed concurrent memory exhaustion.

## First implementation milestone

Start with MS01–MS04 and the MS06 Gateway adapter for one authenticated durable conversation/goal operation. This establishes enforcement, contracts, process lifecycle, ownership and restart-safe data before expanding all service features. It does not bypass MS05 for any operation that needs policy/budget/effect coordination.

No production migrations, deployment, provider spend, new credentials or sandbox selection occur as part of writing this plan. Resolve workload/data/spend/isolation prerequisites only when the named implementation gate actually needs them; continue independent service work meanwhile.
