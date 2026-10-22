# ASI — Backend Architecture and Build Specification

This repository now holds the unchanged product vision and a new backend-first implementation specification. **This is architecture and planning work, not a completed backend.** Existing backend code is retained for selective reuse; dependency manifests and old documentation were removed at the product owner's request.

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

All pre-existing `.md` and `.json` files were removed before creating this documentation. That includes package manifests, compiler configuration, and migration/test ledger inputs. **There is currently no supported install/start/test command.** The first implementation stage restores a minimal backend package setup and replaces obsolete ledger dependencies. No dependencies were installed, database migrations executed, provider calls made, or application features implemented during this reset.

The original product file's SHA-256 is `4776824a4ab012e6c6f84c4737906de1f3faf21edbc80314e60cd0c16ad47566`.
