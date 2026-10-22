# Backend structure, boundaries, and dependencies

Status: target design. No runtime skeleton is generated in this task. Node.js and Express remain the required application stack; PostgreSQL and pgvector remain the required database stack.

## Deployment and source organization

Use one versioned backend application with two trusted entry points: HTTP API and durable dispatcher. Local development may run them together, but production lifecycle management should permit independent restart. A narrow native Windows broker manages guest isolation and secrets. Untrusted workers run inside that guest. Modules are in-process domain boundaries; separate security processes are not a justification for per-domain microservices.

```text
repository/
  PRODUCT_IDEA.md
  README.md
  docs/backend/                         architecture and implementation task cards
  backend/
    src/
      bootstrap/
        api.js                          assemble owners; no side effects on import
        dispatcher.js                   task leasing and recovery loops
        lifecycle.js                    owned resources, drain and close
        container.js                    explicit dependency composition
      http/
        app.js                          Express instance, no listen call
        routes.js                       mounts only approved public routers
        middleware/                     session, origin, CSRF, quotas, errors
        serializers/                    safe API views and redaction
        sse/                            durable cursor, heartbeat, backpressure
      modules/
        identity/                       local principal, sessions, worker identities
        projects/                       workspace roots, repository connections
        conversations/                  messages, attachments, clarification
        intelligence/                   intent, research, requirements, decisions
        planning/                       plan layers, revisions, DAG validation
        contracts/                      immutable Build Contracts and diffs
        governance/                     policy, grants, approvals, budgets
        orchestration/                  runs, tasks, leases, checkpoints, recovery
        agents/                         scoped sessions and structured reviews
        providers/                      model registry, router, usage attribution
        tools/                          tool manifests, input validation, effects
        execution/                      coding adapter sessions and receipts
        memory/                         records, revisions, retrieval, graph
        artifacts/                      metadata, ingest, integrity, export
        verification/                   criteria, independent jobs and reports
        automation/                     schedules, triggers, event inbox
        deployments/                    target preflight, release and rollback
        operations/                     audit, activity, settings, retention
      platform/
        database/                       pg pool, transactions, trusted scope
        blob-store/                     local content-addressed store; later S3
        providers/                      OpenAI, Anthropic, local adapters
        coding-adapters/                 Codex, Claude, future qualified adapters
        execution/
          protocol/                     broker/guest envelopes and receipts
          windows/                      named-pipe bridge, ACL, VM lifecycle
          guest/                        bounded execution transport adapter
        secrets/                        Windows DPAPI bridge; later cloud vault
        browser/                        Playwright integration in guest
        repository/                     Git operations and AST/index adapters
        telemetry/                      Pino and OpenTelemetry initialization
        clock/                          real and deterministic test clocks
        config/                         validated environment and defaults
      shared/
        errors.js                       stable domain error definitions
        identifiers.js                  UUID and digest utilities
        canonicalization.js             versioned approval digest format
        contracts/                      pure runtime DTO/event schemas
    database/
      migrations/                       ordered immutable SQL and checksums
      roles/                            provisioning grants and RLS definitions
      seeds/                            development-only safe fixtures
      imports/                          explicit legacy import specifications
    tests/
      unit/                             state, routing, scope and policy functions
      integration/                      real PostgreSQL and artifact store
      contracts/                        public and adapter schemas
      security/                         isolation, replay, SSRF, redaction
      fault-injection/                  process kill and uncertain effects
      acceptance/                       goal-to-artifact release scenarios
      evaluation/                       frozen intelligence suites
      fixtures/                         synthetic, never production credentials
    scripts/                            lifecycle and migration tooling
    .env.example                        non-secret variable names/defaults
  infra/
    windows/                            install, update, service and ACL recipes
    guest/                              reviewed VM image definitions
  third_party/                          only reviewed necessary source/licenses
```

Future implementation creates minimal `package.json`, compiler configuration, and a lockfile despite this documentation reset's current no-JSON state. The structure is a source ownership contract, not an instruction to create hundreds of empty files. Add a directory only when a real feature needs it.

## Module internal convention

Each domain uses `index.js` for its public port; `domain/` for pure invariants; `application/` for use cases and transactions; `infrastructure/` for SQL repository implementations; `http/` for router, schemas, controller and serializers; `events/` for event contracts/handlers. Small domains can keep those responsibilities in a few files. Do not generate meaningless repository/service/controller layers around one pure function.

Controllers parse/validate, authenticate, call one use case, and serialize. Application services coordinate policy, domain behavior, and transactions. Repositories contain parameterized SQL and never accept user-selected table/column names. Domain code cannot import Express, a provider SDK, Windows APIs, or a database client.

## Dependency rules

- HTTP depends on application ports; application depends on domain and injected infrastructure ports.
- Domain modules call another module only through its public port. No cross-module private repository imports.
- Cross-domain atomic operations accept an explicit unit-of-work supplied by the composition root, not unrelated nested transactions.
- A transaction always uses the same checked-out `pg` client. [node-postgres transactions](https://node-postgres.com/features/transactions).
- Untrusted workers never import control-plane SQL repositories or receive their credentials.
- Pure schemas and event DTOs have no side effects, secret resolution, or global mutable state.
- Models/provider SDKs cannot decide approval, budget, or completion transitions.
- API and dispatcher may share domain code and database transactions. Splitting into network services later requires ownership and idempotency tests first.

## Language and package policy

Use JavaScript ES modules with `// @ts-check`, checked JSDoc interfaces, and Zod runtime schemas. Existing TypeScript modules can remain during migration behind the same ports; language conversion is not a prerequisite for reuse. This meets the requested Node.js/Express stack without making a full TypeScript rewrite a hidden requirement. Type-checking remains mandatory whichever source syntax is used.

| Dependency | Purpose | Phase / qualification |
| --- | --- | --- |
| Node.js 24 LTS | Runtime, fetch, crypto, abort signals, streams, native test runner | Foundation; pin a supported security patch and verify Windows behavior |
| Express 5 | HTTP routing and async error propagation | Foundation; no business authority in middleware |
| `pg` | PostgreSQL connections, parameterized SQL, explicit transactions | Database foundation; pool timeout/reset and TLS tests |
| PostgreSQL `vector` extension | Durable vector type and optional ANN indexes | Provision explicitly; application runtime cannot install extensions |
| npm `pgvector` | Safe vector serialization/type registration for pg | Memory phase; distinguish JS package from server extension |
| `zod` | Strict request/response/config validation | Foundation; one schema source per wire contract |
| `helmet` | Defensive HTTP headers | Foundation; configure for actual local API use |
| `cookie-parser` | Parse opaque session cookies | Identity; no cookie value is an identity assertion without lookup |
| `pino`, `pino-http` | Structured safe logs and request correlation | Foundation; allowlisted fields and secret redaction |
| OpenTelemetry Node SDK/API/exporter packages | Traces, metrics, context propagation | Operations; offline exporter failure must not block execution |
| Official provider SDKs such as `openai`, `@anthropic-ai/sdk` | Provider-specific transport | Only install selected provider; version/capability tests |
| `@openai/codex-sdk` or app-server client | Supported coding execution integration | Adapter phase; enforce external sandbox and usage reporting |
| Claude Agent SDK | Optional alternative coding worker | Later; supported auth and contract tests before enablement |
| `playwright` | Browser verification/automation inside guest | Browser phase; browser binaries pinned with worker image |
| `cron-parser` or equivalent reviewed timezone recurrence library | Calendar scheduling | Automation phase; DST, missed-run, and timezone tests are mandatory |
| `typescript`, relevant `@types/*` | JSDoc/retained TS checking | Dev only; no language-only rewrite |
| ESLint | Static safety/convention checks | Foundation; rules must fit retained source |
| Node test runner; existing Vitest temporarily | Behavioral tests | Prefer one final runner; migrate only after equivalence |
| `supertest` if needed | Express API integration tests | Optional; native HTTP tests are also sufficient |

Versions in removed manifests are historical inputs, not newly verified recommendations. Choose exact patches during stage 01, commit a lockfile, review licenses and transitive dependencies, and run a Windows/database compatibility matrix. Node 24 is currently an LTS line in the [official release table](https://nodejs.org/en/about/previous-releases). Express 5 handles rejected promises from async handlers; a final safe error serializer is still needed. [Express error handling](https://expressjs.com/en/guide/error-handling/).

Avoid initially: Redis/BullMQ as a second workflow authority, Kafka, Kubernetes, a graph database, a separate vector service, a large agent framework, and a universal ORM obscuring transaction locks/RLS. Add any of these only after a measured requirement and decision record.

## Configuration contract

Validate at startup: `ASI_HOST=127.0.0.1`, chosen port, exact allowed client origins, private database reference, pool size, statement/connection timeouts, artifact root, secret-store namespace, worker image identifier, maximum concurrent runs, event retention, and shutdown timeout. Reject unknown/invalid security-sensitive values. Fail closed if mandatory owners are missing; expose the unavailable capability reason separately from basic liveness.

Set development defaults: metadata body limit 256 KiB, list size 50/max 100, default request deadline 30 seconds, provider deadline set per task, bounded stream output, and configurable artifact upload quota. These are initial application limits to benchmark, not provider guarantees. Rate-limit anonymous bootstrap and authenticated sessions independently. Resolve secrets at runtime from references; `.env.example` contains no real values.

## Extraction triggers

Extract a domain into a service only when independent scaling, isolation, ownership, or failure containment requires it. First candidates are remote execution and inference gateways, not policy/budgets/approval transactions. Record latency, deployment, and transaction costs before extraction. A folder named `services` is not a deployment requirement.
