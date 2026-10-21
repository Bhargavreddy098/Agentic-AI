# ASI backend folder: Node.js, Express, PostgreSQL and pgvector

Status: architecture approved by the user on 2026-10-21 with “yes proceed,” in response to the design review request. Implementation-plan review is the next required workflow stage. This document changes no runtime source or database.

## Outcome and scope

Create one root `backend/` containing the Express HTTP application, controllers, routes, schemas, SQL models, services, middleware, database tooling and backend runtime modules. Reuse ASI backend behavior instead of replacing it with CRUD demonstrations. Preserve the ongoing OpenClaw integration and its rule: unsupported or synthetic operations stay hidden.

The target is a personal Windows application with no user RBAC. Local API/session protection, project scopes, agent capabilities, policy, approvals, privacy routing and secret isolation remain necessary. This reorganization must not create an administrator role, bypass guards, enable unqualified tools or promote mocked generation to live inference.

## Target structure

```text
backend/
  package.json
  server.js                    # Node entry point: bootstrap, listen, signals
  app.js                       # Express app factory; never listens on import
  .env.example                 # Names/defaults only
  README.md
  config/
    env.js                     # Validated configuration
    database.js                # Trusted PostgreSQL pool/bootstrap
    logger.js                  # Structured redacted logging
  models/
    conversation.model.js      # Parameterized SQL and row mapping
    message.model.js
    memory.model.js
    vector.model.js
    ...                        # Only actual migrated persistence owners
  schemas/
    conversation.schema.js     # Shared-contract reuse and API validation
    memory.schema.js
    ...
  controllers/
    health.controller.js
    conversation.controller.js
    memory.controller.js
    ...                        # HTTP translation, no SQL or orchestration
  routes/
    index.js
    health.routes.js
    conversation.routes.js
    memory.routes.js
    ...                        # Register actual supported operations
  services/
    capabilities.service.js
    conversation.service.js
    memory.service.js
    ...                        # Use cases and existing domain-owner adapters
  middlewares/
    request-context.js
    session.js
    origin-csrf.js
    validate.js
    rate-limit.js
    not-found.js
    error-handler.js
  database/
    migrations/
    migrate.js
    transaction.js
  modules/                     # Existing reusable backend packages relocated here
    control/
    memory/
    identity/
    policy/
    privacy/
    models/                    # AI provider/model runtime; distinct from SQL models/
    ...
  workers/                     # Existing backend process entry points
  utils/
  tests/
```

The listed domain files are a target map, not permission to create empty controllers/services or advertise missing functionality. Add each with its real adapter and tests. Keep `packages/contracts` as the shared frontend/backend schema boundary and keep frontend packages outside `backend/`.

Use JavaScript ES modules for the requested `server.js`, Express layers and middleware. Preserve TypeScript in existing reusable modules during relocation and compile their existing package exports to JavaScript; do not rewrite tested domain logic merely to change extensions. Use JSDoc and checkJs for new JavaScript where practical. Node.js is the runtime for both.

## Layer responsibilities

Request flow: middleware -> route -> schema validation -> controller -> service -> persistence/domain owner -> PostgreSQL. Responses return safe projections through controllers.

- Models mean SQL repositories, not an ORM requirement. Existing PostgreSQL owner operations remain the sole writers for their domain. Do not add competing writes for runs, effects, approvals, audit or budgets in a generic model.
- Schemas reuse `@asi/contracts` runtime validation and add Express parameter/query/body validation. Database migrations live separately from request schemas.
- Controllers own status codes and safe serialization; services own business orchestration; model functions own parameterized SQL and row mapping.
- Keep external provider credentials behind the privacy service; keep executable tools behind qualified isolation. A folder move does not merge trusted and untrusted processes.
- Retain versioned `/api/ui/v1` paths, command IDs, revision checks, SSE event shapes and capability projection so the OpenClaw adapter does not need a second rewrite.

## Dependencies and system design

Use a small explicit dependency set, with exact versions/engines/peer compatibility qualified before installation:

| Dependency | Purpose |
|---|---|
| Express 5 | HTTP routes and middleware; replaces Hono in the active API after parity checks. |
| Existing `pg` | PostgreSQL pools, parameterized queries and explicit transactions. |
| `pgvector` Node adapter | Vector parameter encoding/type integration; the PostgreSQL vector extension must also be installed and enabled. |
| Existing Zod | Environment, request and response validation. |
| Helmet | Appropriate HTTP security headers; do not blindly break frontend CSP or streaming. |
| `express-rate-limit` | Bounded local request admission; explicit proxy settings and SSE handling. |
| Pino / pino-http | Request correlation and structured secret-redacted logs. |
| cookie-parser, if required by session port | Parse cookies; it is not an authentication or session store. |
| Existing Vitest / Playwright | Contract, integration, failure and frontend browser checks. |

Prefer Node's existing environment loading, UUIDs, AbortSignal and HTTP primitives instead of extra helper dependencies. Default to same-origin frontend/API routing; only add CORS if a concrete cross-origin deployment requires an exact allowlist. Do not add an ORM, Redis, Kafka, Kubernetes or a new vector database for organization alone. Existing queue/outbox behavior must still be preserved when migrating workers.

## PostgreSQL and vector handling

PostgreSQL remains the authoritative application/control/memory store. Preserve current reviewed migrations, checksums and dependency order; relocate tooling with compatibility paths rather than rewriting applied SQL. Provision `vector` through migration-owner operations, never automatically through a runtime database role.

Use one checked-out client for a transaction, release it in finally, bound pool/statement timeouts and expose database readiness separately from server liveness. Controllers and untrusted workers receive no raw pool.

Persist embedding model identity, version and dimensions with records. Current memory migration uses `VECTOR(1536)`; do not pretend a configurable provider can write arbitrary dimensions into that column. Reject mismatches or add a reviewed forward migration. Use the matching distance operator/index strategy after correctness checks, with project/private scope filtering in SQL rather than only after retrieval.

Existing episode storage uses SQLite. This request makes PostgreSQL the target, but silently dropping SQLite would destroy episode/FTS/compression behavior. Keep a legacy compatibility path during migration; any PostgreSQL episode replacement must preserve records, provenance, command deduplication, sequence/replay, compression lineage and crash behavior before removing SQLite authority. No existing database is modified by directory relocation.

## Migration sequence

1. Inventory actual domain owners, current API contracts and current OpenClaw work. Record baseline checks and preserve unrelated edits.
2. Add the Express app/server, config, health/readiness, middleware and capability discovery under `backend/`. Keep legacy entry points available for comparison.
3. Port HTTP routes to Express with the same schemas/services and session/origin/CSRF/error behavior. Do not merely mount the Hono app and call it an Express rewrite.
4. Relocate existing reusable backend modules/workers into `backend/modules` and `backend/workers`, retaining package identities or temporary compatibility exports until consumers/tests are updated. Shared contracts remain outside.
5. Relocate database migration tooling with immutable history and update exact workspace paths/import ownership rules. Extend enforcement to the new folder; never exempt the new backend from architecture/security checks.
6. Connect real PostgreSQL/pgvector owners and preserve idempotency, transactions, leases, outbox/effect semantics and shutdown/recovery. Missing dependencies fail closed.
7. Point OpenClaw's existing typed HTTP adapter to the Express service. Expose only real ready capabilities. Remove legacy HTTP ownership only after contract and browser parity; do not delete historical source/evidence or data to satisfy checks.

## Acceptance

- `node backend/server.js` starts the configured application after required module builds; invalid required config fails clearly and logs no credentials.
- Express liveness works independently of DB readiness; failed PostgreSQL or vector readiness cannot advertise dependent features live.
- Existing enabled API contract tests pass against Express, including validation, session bootstrap, origin/CSRF, unavailable operations, pagination, conflicts and normalized errors.
- SSE works without accidental response buffering, cleans up disconnected clients and retains replay/cancellation semantics.
- Real disposable PostgreSQL tests prove migrations, rollback, transaction scope, concurrency/idempotency and vector query correctness/dimension validation. Preserve legacy store tests until replacement qualification passes.
- No user RBAC is introduced. Existing role/tenant-dependent contracts need an explicit local-context migration, not an automatic admin identity or blanket permission grant.
- OpenClaw browser tests show only ready ASI operations and retain no dependency on an OpenClaw backend.
- Build/type/lint/tests and dependency/architecture enforcement cover `backend/`; protected service boundaries and upstream frontend source integrity remain intact.

## Reference basis

- Express 5 migration behavior: https://expressjs.com/en/guide/migrating-5/
- node-postgres transaction ownership: https://node-postgres.com/features/transactions
- Official pgvector Node integration: https://github.com/pgvector/pgvector-node

The user's framework/folder request supersedes the earlier Hono transport choice for this proposed active backend. It does not discard the existing frontend integration goal or authorize changes to populated data. Review this design before writing the implementation plan under the active skill workflow.
