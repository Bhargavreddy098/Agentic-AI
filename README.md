# ASI — Backend Architecture and Build Specification

This repository holds the unchanged product vision, backend specifications, and an implementation in progress. PostgreSQL/pgvector, local identity, projects, conversations, and encrypted artifacts have executable integration tests. Stage 06 is locally qualified for the selected compatible provider; see [completion evidence](docs/backend/21-STAGE06-COMPLETION.md). The complete backend is still under construction; see [implementation evidence and remaining gaps](docs/backend/14-IMPLEMENTATION-STATUS.md).

## Start here

1. [Original product idea](PRODUCT_IDEA.md) — verbatim source of product intent; do not edit it to fit implementation shortcuts.
2. [Master architecture and build plan](docs/backend/01-MASTER-ARCHITECTURE.md) — all 32 architecture topics, decisions, scope, and navigation.
3. [Repository reality and migration](docs/backend/02-REPOSITORY-REALITY.md) — source evidence, implemented foundations, gaps, and reuse decisions.
4. [Backend structure and dependencies](docs/backend/03-BACKEND-STRUCTURE.md) — Node.js/Express module layout, dependency rules, package choices.
5. [PostgreSQL database specification](docs/backend/04-DATABASE.md) — entity dictionary, constraints, transactions, indexes, migrations, backup.
6. [API contracts](docs/backend/05-API-CONTRACTS.md) — routes, DTOs, authentication, errors, idempotency, SSE, internal worker protocol.
7. [Planning and Build Contracts](docs/backend/06-INTELLIGENCE-AND-CONTRACTS.md) — intent, research, planning layers, immutable approval, agents, decisions.
8. [Durable execution](docs/backend/07-ORCHESTRATION-AND-RECOVERY.md) — state transitions, leases, effects, cancellation, schedules, failure handling.
9. [Security and execution runtime](docs/backend/08-SECURITY-AND-RUNTIME.md) — Windows isolation, policy, credentials, browser/tool/deployment boundaries.
10. [Providers, routing, memory, and project intelligence](docs/backend/09-PROVIDERS-AND-MEMORY.md) — adapters, routing, pgvector, retrieval, provenance.
11. [Verification and operations](docs/backend/10-VERIFICATION-AND-OPERATIONS.md) — acceptance evidence, evaluation, observability, costs, release qualification.
12. [Implementation sequence](docs/backend/11-IMPLEMENTATION-ROADMAP.md) — dependency-ordered task cards with exit gates.
13. [Decisions and research](docs/backend/12-DECISIONS-AND-RESEARCH.md) — alternatives, tradeoffs, source links, uncertainties.
14. [Cleanup record](docs/backend/00-CLEANUP-RECORD.md) — removed paths and recovery baseline.
15. [Documentation validation](docs/backend/13-DOCUMENTATION-VALIDATION.md) — checks performed and their limits.

## Selected direction

Node.js 24 LTS, Express 5, JavaScript ES modules with checked JSDoc and runtime schemas, PostgreSQL, pgvector, SQL-first repositories, a modular control plane, and separately isolated execution workers. PostgreSQL owns durable state. Models propose; trusted code authorizes; independent evidence determines completion.

The initial target is a single-user Windows installation. Cloud control planes, remote workers, organizations, and billing are later extensions. The full vision remains intact in the original idea; release phases control when capabilities are built.

## Current checkout limitations

Unused UI assets, app-builder metadata, UI test setup, and an unreferenced vendor snapshot were removed in the [repository cleanup](docs/backend/20-REPOSITORY-CLEANUP.md). A verified recovery archive remains under ignored `data/cleanup/`; application data, credentials, and backend/security tests were preserved.

For PostgreSQL setup and completed Stage 02 evidence, see [local PostgreSQL qualification](docs/backend/15-LOCAL-POSTGRESQL-QUALIFICATION.md). Completed dependencies are documented in [Stage 03 identity/session](docs/backend/16-LOCAL-IDENTITY-QUALIFICATION.md), [Stage 04 product](docs/backend/17-LOCAL-PRODUCT-QUALIFICATION.md), [Stage 05 governance](docs/backend/18-LOCAL-GOVERNANCE-QUALIFICATION.md), and [Stage 06 provider status](docs/backend/19-LOCAL-PROVIDER-QUALIFICATION.md) records. Normal startup enables identity, product, governance, and provider services with migrations 001-013. Stage 06 has a successful capped call against an operator-allowlisted OpenAI-compatible endpoint plus live revoked-auth, 429, and timeout qualification; the official OpenAI target remains unverified. Use `npm run db:verify -- --stage06` for current local readiness. The default migration command also includes unfinished later-stage work; use the explicit stage flag.

The documentation reset removed old manifests and ledgers. The subsequent authorized backend build restored pinned dependencies, compilation, tests, and forward SQL migrations. The earlier reset is recorded in the cleanup document; it does not describe the current implementation.

Use Node.js 24.19.0 and `npm ci --ignore-scripts`, then `npm run build`, `npm run lint`, and `npm test`. Integration tests require a local PostgreSQL administrator connection in the ignored `.env.admin` file and create isolated test databases and roles. Never commit credential files.

The local installation uses separate migration and runtime database roles. `npm run db:verify` checks runtime readiness; `npm run db:migrate` creates an encrypted backup before applying pending migrations. `npm start` starts the backend. Native session bootstrap is issued with `npm run session:challenge`; the launcher receives a private short-lived challenge file. Planning, isolated execution, independent verification, schedules, deployment, and release qualification remain incomplete; Stage 06 provider code is present with a live capped compatible probe and live revoked-auth, 429, and timeout qualification; official OpenAI rejected the configured key.

The original product file's SHA-256 is `4776824a4ab012e6c6f84c4737906de1f3faf21edbc80314e60cd0c16ad47566`.
