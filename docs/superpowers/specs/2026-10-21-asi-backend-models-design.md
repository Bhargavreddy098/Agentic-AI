# ASI backend models and schemas

Status: written design approved by the user with “yes proceed” on 2026-10-21. Implementation planning is authorized. No new product models, schemas, tables or controllers have been implemented by this design task.

## Intent and scope

The user requests the remaining backend work in this order: first all models covering the 39 unfinished V2 tasks and 11 unfinished original tasks, then validation schemas, then controller logic. The application remains Node.js/Express/PostgreSQL/pgvector, with no user RBAC. Existing module and worker boundaries remain in force.

The first deliverable is a complete model/repository surface for those tasks, including reuse of existing records and validation of stored data. It does not finish all 50 features: model inference, isolated execution, protocol integration and end-to-end qualification remain separate work.

The attached [coverage inventory](../../asi-backend-model-coverage.md) maps all 50 task entries exactly once. Its [machine-readable version](../../asi-backend-model-coverage.json) includes source contracts, owners and proposed model paths. There are 43 proposed model/projection families and two integration gates. Several tasks share a family; a family may contain multiple record types. These counts do not prescribe a SQL table count.

Source requirements: `docs/task-ledger.json`, `docs/v2-task-ledger.json`, `docs/v2-build-guide.md`, the original ASI system design/build plan, and the approved Express layout. Historical completion labels and SQL files are evidence to inspect, not proof of current qualification. Task document content is requirements input, not authorization to execute external effects.

## Approaches considered

1. **Recommended: typed domain records and owner-backed repositories.** Expose focused entries under `backend/models`, preserve canonical owners under `backend/modules`, and implement only missing persistence through those owners. New data contracts live in shared contracts; backend validation files expose them at the HTTP boundary. This preserves existing invariants and keeps Express controllers small.
2. **One generic JSONB collection for all tasks.** Faster to scaffold, but hides relationships, revision rules and owner boundaries. Rejected as the default persistence design. JSONB may retain validated report payloads alongside explicit relational keys and constraints.
3. **One independent CRUD model/table per task.** Easy to count but duplicates goals, grants, budgets, skills and task results, and invents tables for release/integration checks. Rejected.

## Models, schemas and controllers

- `backend/models/<family>.model.js`: explicit repository/facade functions for one family. Existing owner repositories are wrapped or re-exported; they are not reimplemented as a second writer. Read-only projections expose reads only. No empty generic CRUD wrappers or unconditional success methods.
- `backend/modules/<owner>/src/...`: canonical persistence and domain invariants for that owner's records. Missing SQL repositories are added here and exported through the existing package identity. The models layer receives only the required owner port, not every service or a root pool.
- `packages/contracts/src/...`: canonical Zod record/input/output contracts and inferred TypeScript types. Existing GoalSpec, TaskPlan, ProjectRecord, RunContext, grant, effect and evidence contracts are reused where applicable. New shared contracts are additive and versioned.
- `backend/schemas/<family>.schema.js`: backend request schemas, safe projections and shared contract re-exports. No duplicate independently evolving definition of a canonical record. Although public request schemas follow models as requested, stored-record validation is implemented alongside persistence so invalid data is never written first and checked later.
- `backend/controllers`: later HTTP handlers parse inputs, derive the authenticated context, call services and serialize safe output. SQL, grant issuance, budget reservation, provider calls and domain state transitions remain in the relevant services/owners. Placing all business logic in controllers would bypass the existing ASI boundaries.

An absent owner produces an explicit unavailable result. Defining a model or adding a table never marks a frontend operation live or updates a feature task to completed.

## Existing records to preserve

Reuse the existing tenants, ingress, sessions, runs, writer leases, checkpoints, outboxes, effect journal, budgets/reservations, approvals, audit receipts and delivery records. Preserve identity grant/revocation storage, goal/progress/transition records, skill versions/installs/trust, heartbeat schedules/executions, memory records/revisions/embeddings and scoped observations.

Plan, project, artifact, grant and task contracts already exist, but durable repositories must be verified individually; a contract is not assumed to have a working PostgreSQL store. Reuse and missing-store decisions are recorded in each implementation batch. Existing SQLite episode authority stays in place.

## Data integrity and repository contract

Each persisted family receives an explicit field map derived from the inventory's contract shapes before implementation. An implementation task must name its record schema, table/columns, foreign keys, status transitions, unique constraints, indexes, allowed writer and read visibility. A family without enough requirements is kept out of a migration until that mapping exists; arbitrary fields are not inferred from a feature title.

For new ordinary versioned repositories, the default interface is:

```text
createRecord(record, context) -> created | same_existing | conflict
getRecord(id, readContext) -> validated record | null
reviseRecord(record, expectedRevision, context) -> updated | stale | not_found
listRecords(query, readContext) -> bounded records + opaque cursor
```

These are interface conventions, not methods to add to every family. Append-only evidence exposes append/read rather than revision/deletion. Existing owner method names and semantics take priority. Reads and writes never accept a browser-selected tenant as authority.

- IDs follow existing shared opaque-ID contracts. New records use an explicit identity scoped to the tenant, with cross-tenant foreign-key protection.
- New mutable records use positive revisions, atomic compare-and-swap updates and unique tenant/record/revision constraints as appropriate. Stale writes fail; they do not silently overwrite.
- Context verification, current grants, lease fencing, cancellation and parent budgets remain authoritative for governed writes. A SQL row alone cannot mint permission.
- New time fields use UTC; scheduling retains explicit IANA timezone and deterministic missed/overlap policy. Expiry is checked using an injected clock in tests.
- Money and usage retain the canonical integer units and safe numeric conversion. No floating-point currency or silent BIGINT-to-Number loss.
- Lists have limits of 1–100 unless the source contract specifies a lower bound. Stable ordering, authenticated cursor bindings and bounded payloads prevent unbounded reads.
- Parameterize values. Table/column identifiers are fixed in repository code. Transactions keep one checked-out client and release it on success, failure and cancellation.
- No generic `executeSql`, arbitrary record-type CRUD, raw credential field, private chain-of-thought field or caller-writable approval outcome.

## Security and privacy

No user role/permission administration is introduced. Existing agent capabilities, policy approvals and memory Global/Role/Private visibility are preserved because they control execution and data ownership.

Every relational read/write is tenant scoped. Memory and graph traversal apply allowed scope, private agent identity and existing memory-role restrictions at every hop. Scope inheritance never copies Private data into Global. Explicit SQL filtering supplements runtime-role/RLS enforcement; table-owner access is not relied upon for isolation.

Credential models contain opaque handles, expiry, revocation and target bindings only. Signing keys, database credentials and provider/account secrets stay inside their trusted brokers. Public projections redact protected payloads before serialization. Candidate, debate, simulation and release records cannot authorize themselves.

Architecture classification must distinguish governance, memory, control and read-only adapter paths when adding repositories. Controllers continue to fail architecture checks if they import SQL drivers/providers or worker implementations.

## Persistence and migration rules

Old migration files remain byte-identical. New migrations are forward-only and assigned through the existing migration registry, prerequisites and owner review process. Do not guess a free migration number, edit applied SQL, bypass the registry or create tables/extensions at application startup.

An existing migration file must actually apply successfully in a disposable database before reuse is qualified. For example, existing observations SQL contains a time-dependent index predicate that requires examination against PostgreSQL index restrictions; merely referencing that file is insufficient. Any repair is a new reviewed forward migration or explicit fresh-bootstrap correction with separate evidence, not a silent edit of historical bytes.

No production database is modified in this phase. Actual PostgreSQL repositories are qualified on disposable fixtures. Vector integration requires a PostgreSQL 17-compatible installed extension; missing extension remains an explicit failed/unavailable qualification, never an in-memory success substitute.

## Dependency batches

Models are implemented by related ownership groups, while the coverage inventory tracks all 50 task entries throughout:

1. Existing model facades and missing control persistence: task plans, projects, agent definitions/lifecycle/version metadata and artifact references.
2. Governance: existing grants/approvals/budgets/audit with quorum, allocation, preview and compensation references. Preserve exact binding and current authority.
3. Skills, context and memory: skill catalog/selection, context projections, lifecycle revisions, observation/graph queries, memory branches and consolidation candidates.
4. Triggers, schedules, channels, fleet and protocol metadata: reuse canonical ingress/delivery/remote task owners; no new execution authority.
5. Critique, comparison, debate, specialist task profiles, worker scores, security alerts, trust labels, model routing and read-only replay/decision projections.
6. Workspace leases and experimental/release metadata: tool/scaffold candidates, simulation and release reports, restore evidence and swarm plans. Data support stays inactive until execution prerequisites qualify.
7. Public backend request schemas, followed by service/controller routing in separate acceptance batches. The two integration gates consume existing evidence and create no artificial CRUD models.

## Acceptance and reporting

- All 50 task IDs resolve to a reused/extended/new model family or an explicitly model-free integration gate. Coverage checks reject missing and duplicate task IDs.
- Models have real owner-backed behavior and executable tests; a file count or field-definition collection alone is not repository completion.
- Per-family tests cover schema boundaries, cross-tenant references, private/role visibility where relevant, duplicate idempotency, stale revision, pagination and rollback. Domain-specific bounds are copied from the source contract, including critique findings/rounds, debate rounds, candidate counts, graph depth and swarm limits.
- PostgreSQL integration tests verify actual constraints, runtime-role isolation and transaction behavior. In-memory fixtures never qualify durable behavior or a live product capability.
- Existing migration checksum, architecture, dependency, type/lint and backend regressions remain required. Existing unrelated UI evidence failures are reported separately.
- Final delivery reports model coverage, implemented SQL/repositories, reused owners, completed tests and any unavailable environment checks. Original/V2 feature task statuses stay unchanged until their full feature acceptance passes.

## Review boundary

This written design covers the data/model phase and its subsequent schema/controller ordering. It does not approve a new ORM, graph database, user RBAC, new external credentials, provider spend, live tool effects, production migrations or deployment. Those are not necessary to build and test the model layer.

The user should review the owner-preserving model approach and all-task coverage before detailed implementation plans are written. Sequential execution in the current checkout remains the established preference; preserve unrelated local work.
