# ASI microservices architecture and migration plan

Date: 2026-10-21. Status: proposed for review. Planning only: no service extraction, deployment, dependency installation or database mutation has been performed.

Execution companion: [service-by-service build plan](2026-10-21-asi-microservices-build.md), with MS01–MS15 work packages, dependencies and acceptance criteria.

## Recommendation and current state

Keep the monorepo and move toward eight independently buildable and deployable service boundaries. Build each service's models, stored-record schemas, domain services, controllers, routes, tests and operational entry point together. Preserve the user's requirement for Node.js/Express/PostgreSQL/pgvector and no user RBAC.

The current backend is a modular application with separate worker entry points, not a completely undivided monolith. Evidence:

- `backend/server.js` and `backend/app.js` provide one Express browser-facing application with injectable ports.
- `backend/modules` contains 19 existing domain packages; `backend/workers` contains eight worker applications. Several worker HTTP routes and owners remain incomplete or synthetic; entry points do not establish independent production readiness.
- `docs/architecture-baseline.json` already separates governance, control, privacy routing, memory, episode ownership, orchestration, specialists and tools logically.
- `backend/modules/control/src/runtime.ts`, policy/budget implementations and the control migration functions rely on canonical grants, sessions, runs, leases and budget state. Splitting these by table would change consistency/security semantics.
- The current default Express composition has no production authentication or durable UI owner wiring. Microservice extraction must not relabel that as a live system.

The recommended change is therefore gradual extraction of real runtime/data boundaries, with independently packaged services and network contracts. Creating eight folders, or running eight processes against unrestricted shared tables, does not finish that migration.

Each service owns its data and exposes it through contracts; the same PostgreSQL server may initially host separate service databases, with distinct runtime identities. Other services do not query those private tables. This follows the [Microsoft data-ownership guidance](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/data-considerations).

## Target service boundaries

| Service | Responsibilities | Existing source to reuse | Data and credentials owned |
| --- | --- | --- | --- |
| API Gateway | Stable browser API, session/origin/CSRF handling, request limits, streaming/projections, channel/webhook adapters | Root Express app, gateway UI ports, channels | No business database credentials; browser sessions and canonical ingress are accessed through Core |
| Core | Identity/grants, policies/approvals, atomic budgets, audit, runs/leases/checkpoints, effects, outboxes, goals/plans/projects, schedules and durable metadata | control, identity, policy, budgets, audit; persistence portions of gateway/skills | `asi_core` PostgreSQL database; identity/policy signing material; trusted artifact metadata and durable blob storage |
| Orchestrator | Plan execution, context assembly, task decomposition, bounded retries/critique/debate, scheduling coordination and recovery decisions | orchestrator, context, selection portions of skills | No direct Core/memory database access; durable workflow state is accessed through Core commands |
| Memory | Scoped semantic retrieval, pgvector, memory revisions/lifecycle, branches, observations/graph and consolidation candidates | memory, memory-broker; scoped observation/consolidation extensions | `asi_memory` PostgreSQL database with pgvector; exclusively scoped runtime role |
| Episode | Exclusive episode append/search, compression lineage and transcript replay storage | episodic, episodic-owner | Owner-exclusive local SQLite storage; no shared network/sync-folder WAL access |
| Inference | Privacy classification/redaction, qualified provider/model selection, generation/embedding, usage reporting | privacy, models, privacy-router | Provider credentials and private provider configuration; no policy signing keys or direct Core/memory database access |
| Tool Runtime | Verified tool registry/dispatch, action previews, MCP/A2A integration, sandbox execution and exact effect/result handling | tools, protocols, tool-engine, sandbox | No Core/memory database credentials; scoped execution bindings inside trusted host only; untrusted handlers run in the separately qualified sandbox |
| Specialist | Bounded browser/data/coding/research task execution, eligible-worker scoring and task result/evidence production | specialists, specialist | No direct domain database/provider/signing credentials; scoped service calls and sandbox/task permissions only |

The Core is intentionally a cohesive transactional service, containing internal modules. Identity, policy, budgets and audit are not extracted into independent databases during the initial migration. That can be considered later if measured needs justify redesigning and qualifying their distributed consistency protocol. Smaller services are not automatically safer or easier to operate.

Skills catalog/trust/version metadata and artifact metadata start in Core. Instruction selection runs in Orchestrator; executable skills run only in Tool Runtime. Artifact bytes are registered against trusted observed digests and retained in a Core-owned artifact store; production download/publication remains separately authorized. A future artifact/skills service is optional, not an initial prerequisite.

The eight services are build/deployment boundaries, not replacements for the existing ASI logical component IDs. Keep logical component mapping inside each service so governance, privacy, tool and storage import rules remain enforceable.

## What independent development means

- Each service has its own manifest, configuration validation, `server.js` or worker entry, readiness, startup/shutdown, build/test commands, deployable artifact, version and operational runbook.
- A service can build and run its contract tests without starting every other service. Dependency simulators are explicitly test-only and never qualify a live workflow.
- Each service can be restarted/upgraded without rebuilding all others when its contracts remain compatible. The monorepo lockfile and shared contracts do not require lockstep deployment.
- Models and controllers are private to their service. Other services use an API/client or queue contract rather than importing repositories, controllers or another service's package entry point.
- Keep Node.js/Express initially. The architecture permits a different language/runtime later through a versioned contract; rewriting each service in a different stack is not part of this migration.
- Do not give every service a database. Stateless coordinators and executors access authoritative state through the owner. Local caches are explicitly disposable and cannot authorize effects.

## Proposed repository layout

```text
backend/
  services/
    api-gateway/
    core/
    orchestrator/
    memory/
    episode/
    inference/
    tool-runtime/
    specialist/
  modules/                    # Existing domain code during extraction
  workers/                    # Existing launchers during transition
  server.js                   # Temporary Gateway compatibility entry
packages/
  contracts/                  # Pure versioned HTTP/event/DTO schemas
  service-clients/             # Transport clients, no SQL/domain authority
apps/
  openclaw/
  web/
infra/
  windows/                    # Per-service dev/release lifecycle configuration
docs/
  service-catalog/
```

Each service folder contains:

```text
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
database/migrations/          # Only for a service that owns a store
tests/
README.md
```

Do not add empty models/migrations folders to a stateless service solely for symmetry. Existing `backend/services/*.service.js` are application-layer port adapters; migrate them into API Gateway deliberately before removing the legacy flat layout. Domain packages can initially remain under `backend/modules` but must be included only in the deployable artifact of their designated owner. Shared contracts/client libraries contain no persistence, signing configuration or provider SDKs.

New `backend/services/*` workspace paths require explicit workspace, TypeScript, scanner, dependency-inventory and logical-component mappings. Longest-prefix mapping must not classify all service source as Gateway merely because the old parent directory was mapped there.

## Communication and contract design

### Synchronous calls

Use versioned internal HTTP/JSON contracts for bounded requests requiring an immediate answer: session validation, current grants/policy, atomic budget reservation, run/lease transitions, memory queries and owner projections. Public routes stay `/api/ui/v1`; internal routes are `/internal/v1` and are never blindly exposed by the Gateway.

Each request binds request/correlation ID, authenticated service identity, intended audience, delegated principal context, deadline, idempotency key for mutations and exact payload digest. Receiving services validate identity and delegation independently. Never trust a forwarded tenant/header/principal merely because it came from an internal IP address.

Set per-operation timeouts within the original caller deadline, bound response bodies and propagate cancellation. Retry only safe reads or commands with demonstrated persisted idempotency, using the same key and digest. Do not retry an unknown tool/provider effect as a new action.

Initial network contracts to define before extraction:

| Owner | Contract families |
| --- | --- |
| Core | Session/principal verification; goal/plan/project reads and CAS commands; claim/renew/checkpoint/cancel; authorize/reserve/prepare execution; begin/report/reconcile effect; durable task/metadata operations |
| Memory | Scoped memory query; revision/lifecycle CAS; bounded graph/branch traversal; consolidation proposal/read |
| Episode | Append idempotently; session transcript/search; sequence/cursor replay; lineage/reconciliation |
| Inference | Governed generate/embed request; stream/result; normalized failure/unknown usage; qualified model catalog |
| Tool Runtime | Verify/register; preview; governed execute; execution status/result; MCP/A2A adapter operations within existing scope |
| Specialist | Worker eligibility/descriptor; task execution; progress/result and cancellation acknowledgement |

Orchestrator and Gateway compose these contracts. They do not become alternate authorities for data owned elsewhere. Models are not automatically turned into public CRUD endpoints.

### Asynchronous work

Reuse the already-pinned Redis/BullMQ stack for queued task dispatch and background work; do not introduce Kafka/RabbitMQ solely for extraction. Broker/runtime qualification on Windows or a permitted VM is required before queues are used for live work. Redis is not the durable source of approval, money, leases or effect outcomes.

Use a transactional outbox in the authoritative store when a state mutation produces work. A relay publishes after commit and can publish duplicates; an idempotent consumer uses a durable inbox or the authoritative command/effect idempotency record. Database state and queue publication are not assumed to be one distributed transaction. See the [transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) and [BullMQ idempotent-job guidance](https://docs.bullmq.io/patterns/idempotent-jobs).

Event envelope:

```text
schemaVersion, eventId, eventType, producerService, tenantId,
aggregateType, aggregateId, aggregateVersion, occurredAt,
correlationId, causationId, payloadRef, payloadDigest
```

Tenant derives from authenticated owner context. Version schemas and validate producer/audience; put refs and bounded safe metadata on the queue, not secrets or unrestricted input blobs. Use tenant/aggregate sequence/version checks for ordering rather than a claim of global order. Sensitive authorization decisions use current Core checks, not an eventually consistent event cache.

Queue names and Redis ACLs separate producers/consumers. One work queue is not event fan-out: each independent event subscriber needs its own durable delivery record/queue. A consumer acknowledges only after its own durable mutation or the authoritative Core command commits. Dead-letter/reconciliation states preserve unknown outcomes; maximum attempts include previous retries.

## Data and transaction boundaries

1. Core and Memory have separate databases and roles. A single local PostgreSQL instance is acceptable initially; neither runtime identity can connect to/query the other's database. Cross-service joins and foreign keys are replaced by typed references plus owner validation.
   Memory keeps a minimal owner-local tenant provisioning/revocation projection for local foreign keys; it does not import the full Core schema to satisfy the old `tenants` reference. Missing or stale required provisioning denies the affected operation. A local tenant projection is not authentication or current grant authority. Cross-service goal/run/artifact references retain source IDs, versions and digests and are checked through their owner contract.
2. Preserve local SQL foreign keys and transactions inside each owner. Cross-service workflow steps use explicit state transitions, outbox delivery and reconciliation/compensation. A compensation is a newly authorized action and cannot promise reversal of an irreversible external effect.
3. Core initially preserves run/lease fencing, current policy/grants, budget reservation, approval consumption and authoritative effect transitions together. Define the exact database transaction for each command before extracting its callers. Do not simply replace every old function call with a separate HTTP request and claim atomicity is preserved.
4. `prepareExecution`/`beginExecution` bind run/epoch, exact input/artifact digest, current grant/policy, budget reservation, executor audience, idempotency key and a bounded validity period. The trusted executor verifies and consumes the current dispatch decision before effects; reporting uses the same execution identity.
5. A revoke/cancel after execution begins cannot guarantee that a remote effect is undone. Reject stale new dispatches/publications, record in-flight/unknown states and reconcile before retry. No exactly-once external-effects guarantee is introduced.
6. Episode SQLite remains exclusively owned by Episode. Deploying more Episode instances requires explicit session sharding with one writer per shard; do not mount the same WAL path in multiple services. Use an ACL-controlled local data directory outside OneDrive/network/sync storage.
7. Provider calls consume approved usage/reservation bindings from Core; only Inference has provider credentials. Missing privacy routing, Core authorization or budget state denies new governed calls. Interrupted/uncertain provider usage must be reconciled conservatively.
8. Memory queries apply tenant/Global/Role/Private scope on every graph hop and vector join. Independent Memory deployment does not weaken existing visibility rules or add user RBAC.
9. Artifact byte transfer uses an authenticated bounded upload to the trusted artifact owner, staged digest/size verification, then metadata registration. Incomplete blobs are not published; orphan cleanup is bounded and independent of audit retention. A database/file write is not described as one atomic transaction.

## Service identity, observability and Windows operations

Keep browser session authentication and CSRF at API Gateway while internal services verify service identity and scoped delegation. No public route can choose a privileged service audience. Use distinct service credentials; never distribute the identity/policy signing master key to every service or untrusted worker. Qualify authenticated TLS/mTLS for release, with normal certificate validation and key rotation. Local test certificates are test-only; disabling certificate checks is not a release configuration.

Each service exposes `/health/live` for its own process and `/health/ready` for dependencies actually required by that service. Gateway should not require local pgvector to answer a connection-only probe; Memory readiness does require its installed vector extension. Capability discovery remains operation-specific: healthy does not mean live, and synthetic/missing operations remain hidden.

Propagate trace/correlation/request/run IDs through HTTP, queues and receipts. Record safe latency/error/queue-lag/retry/unknown-outcome metrics. Redact authorization headers, cookies, credentials and sensitive payloads. Track outbox age, oldest pending work, budget reconciliation and memory/episode failure separately.

Development and deployment remain Windows-first under ADR 0004. Plan a PowerShell/process supervisor that starts selected services, waits for readiness, writes separate logs and stops only the PIDs it owns. Production Windows service lifecycle/ACL/secret/certificate/backup behavior needs explicit qualification; Node alone is not a registered Windows Service. No default Docker/Kubernetes/Linux migration is assumed. Optional VM-backed isolation retains its separately reviewed requirement; ordinary worker processes are not a substitute for a sandbox.

For each service, produce an independent build/test/package command and release manifest with contract versions, owned migration prerequisites, required dependencies and rollback procedure. Service-specific runtime configuration contains only that service's credentials. An infrastructure PostgreSQL/Redis outage can still affect multiple services on one machine; independently deployable does not imply physically independent failure domains.

## Migration phases and build order

| Phase | Deliverable | Exit criteria |
| --- | --- | --- |
| 0 — Freeze boundaries | Service/model ownership map, atomic-command inventory, dependency graph, API/event contracts, ADR proposal and baseline tests | Every existing module/worker and all 43 proposed model families have a primary owner; no unowned tables or circular private-code imports |
| 1 — Core and Gateway | Core service API around current authoritative modules; Gateway transport clients behind existing UI routes | Real authentication/owner composition qualified for the tested slice; contract parity; no Gateway SQL/signing/provider credentials; idempotent mutations and stale-writer tests pass |
| 2 — Memory and Episode | Independent Memory API/database/role and Episode API/exclusive local SQLite owner | Actual pgvector query/scope tests, durable episode replay, restricted roles, startup/restart/backup/restore and cursor parity pass |
| 3 — Inference | Privacy/provider service with bounded requests/streams and Core budget/usage contracts | Qualified provider policy/credentials, forbidden fallback denial, cancellation/unknown usage/reconciliation pass; mocks do not qualify live inference |
| 4 — Orchestrator | Workflow engine using Core/Memory/Episode/Inference clients and transactional dispatch | Repeated/reordered events, crash/restart, bounded critique/debate, lease loss and budget exhaustion preserve canonical state without duplicate effects |
| 5 — Specialist and Tool Runtime | Independently packaged specialist consumers and trusted tool host; isolated executable path | Governed task/result contracts; exact input/artifact approvals, current grants, cancellation/stale publication, real sandbox and protocol scope tests pass |
| 6 — Release migration | Per-service deployment, compatibility/canary/rollback and full real product slice | Independent restart/update demonstrated; full required security/integration/browser gates pass; unsupported capabilities remain unavailable |

Memory, Episode and Inference can be developed as independent service slices once their contracts are frozen. The qualification sequence stays explicit: a dependent live workflow cannot pass before its owners pass. Core/Gateway first establishes the contract and authorization spine; it is not a requirement to finish every experimental model before extracting another service.

Within each service, work in this order:

1. Freeze that service's contracts, data ownership and acceptance examples.
2. Implement/reuse models and stored-record schemas with real owner tests.
3. Implement domain services and validation schemas.
4. Add controllers/routes and transport clients with deadlines/idempotency.
5. Add outbox/queue behavior only where asynchronous work requires it.
6. Qualify startup/shutdown, restricted credentials, failure/recovery and release packaging.
7. Integrate one genuine workflow through Gateway; keep unqualified capabilities hidden.

## Existing-data migration and rollback

Use gradual routing behind the existing Gateway. First put network contracts around existing owners without moving populated stores. For each later physical data move: inventory tables/foreign keys/functions/triggers/roles; snapshot and verify backup; create owner-local schema with forward migrations; copy into a disposable target; compare row counts and content digests; test restricted-role behavior; rehearse a bounded write freeze, final delta, owner switch and rollback.

Never enable two active writers to the same aggregate. Cut over only after old writes are quiesced and in-flight/unknown effects are reconciled. Record the exact cutover epoch/sequence. Preserve applied migration identities/checksums; no rewrite of old migrations, automatic live store conversion or production data movement is authorized by this planning request.

For an application rollback while the new store remains authoritative, use a compatible old client/server adapter rather than switching blindly to an out-of-date database copy. After new writes begin, reversing a data move requires a rehearsed reverse migration or compatible forward repair; an old backup alone is not a safe rollback. Retain old stores read-only until the retention and restore procedure is qualified.

## Acceptance tests that prove the architecture

- Service A cannot import Service B's models/controllers/private runtime package, query its database or read its secrets. Scanners include negative fixtures for service paths and declared shared clients.
- Each service builds/packages/tests independently and rejects incompatible contract versions clearly. Run current/previous compatible consumer-contract tests before producer rollout.
- Stop Memory: memory-dependent work becomes unavailable without synthetic substitution; Gateway liveness and unrelated Core reads continue within measured limits.
- Stop Redis: committed outbox work remains recoverable; no unbounded in-process buffer or silent dropped command. Recover and prove idempotent processing.
- Crash between database commit and queue publication, before/after external effect and before result acknowledgement. Prove persisted identity, duplicate handling, unknown outcomes and reconciliation.
- Deliver duplicated, delayed, out-of-order and conflicting-digest commands/events. Reject stale cross-tenant/wrong-audience/expired-grant requests.
- Cancel/revoke or expire a lease while an executor waits or is running. Deny stale new dispatch/publication without claiming an already-started external effect was rolled back.
- Exercise real PostgreSQL runtime-role isolation, pgvector nearest-neighbor filtering and Episode SQLite exclusive-writer/backup/restore behavior.
- Upgrade/restart one service without changing the deployment of compatible peers. Check graceful drain, bounded timeouts and no orphaned owned processes.
- Demonstrate an authenticated non-demo browser goal → bounded plan → authorized execution → real artifact → verification → delivery flow. A seeded unsupported claim remains unknown/unmet.

Existing UI evidence mismatches, missing pgvector, missing real authentication/provider ports and unqualified sandbox remain actual prerequisites to resolve. Passing an isolated microservice test does not waive them or complete the original/V2 task ledgers.

## Effect on the previous models plan

The existing 50-task coverage and 43-family model definitions remain useful requirements. The proposed centralized placement is superseded by service-local placement if this microservices plan is approved. Do not implement all new models under root `backend/models` and then move them again.

The companion [service ownership map](../../asi-microservices-model-ownership.md) assigns each proposed family a primary API/model owner and a persistence owner. Reports may be produced by Orchestrator/Specialist/Tool Runtime while their canonical records remain owned by Core. That distinction does not grant the producer direct database access.

Rewrite the earlier model batch file paths and migration targets only after service boundaries are accepted. Previous proposed migration numbers are not automatically applied to independent databases; each owner receives its own registry and forward migration history with a global source-provenance map. New owner-local bootstrap migrations describe their complete schema; they do not falsely journal original migrations that were never applied in that database. Preserve the original database's actual applied history and checksums. Do not mark the earlier unimplemented model plan complete or any feature live.

## Scope and next implementation slice

Recommended first implementation slice: service workspace/enforcement tests, Core contracts and process entry, then Gateway-to-Core session and one durable conversation/goal command with idempotency. This proves the extraction pattern before building remaining service models.

The current request produces this plan and its ownership map only. Service implementation, schema migration, real external credentials, sandbox selection and deployment have not started. No approval flag or task-completion evidence is changed by this proposal.
