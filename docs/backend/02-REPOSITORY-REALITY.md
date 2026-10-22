# Repository reality and migration map

Inspected 2026-10-22 at baseline commit `96f82dfc`. This is a targeted source audit across all requested subsystems, not a claim that every file was reviewed or any test passed. Paths below are repository-relative. Removed paths refer to the baseline in Git; retained paths can still be inspected locally.

## Evidence and status

| Area | Evidence | What exists | Classification and required action |
| --- | --- | --- | --- |
| Product documentation | Historical `README.md`, `docs/superpowers/specs/2026-10-06-asi-agent-design.md`, `docs/v2-build-guide.md` | Conflicting generations of local-first, UI, Windows, and microservices plans | Superseded; deleted and replaced by this pack. Historical completion claims are not revalidated |
| Planning/ledgers | Historical `docs/superpowers/plans/2026-10-21-asi-microservices-build.md`, `docs/task-ledger.json`, `docs/v2-task-ledger.json` | Eight-service target and migration prerequisites | Removed; do not use missing ledgers as evidence or silently bypass their protections |
| Express app | `backend/app.js`, `backend/server.js` | Injectable app, request context, Helmet, logging, readiness, shutdown | Implemented source foundation; preserve patterns, retest composition |
| HTTP controllers | `backend/routes/domain.routes.js`, `backend/controllers/domain.controller.js` | Cancel, clarification, approval, catalogs, memory, uploads | Partial public surface; new `/api/v1` contracts require explicit migration |
| Runtime composition | `backend/server.js` calls `createApp` without populated domain services | HTTP server can start independently of product owner services | Missing complete production composition; do not equate readiness with product functionality |
| Sessions | `backend/middlewares/session.js` | Cookie lookup through injected session owner | Partial; local bootstrap, durable sessions, revocation, and lifecycle must be qualified |
| Identity | `backend/modules/identity/src/postgres-grant-store.ts`, `verify.ts`, `revoke.ts` | Token/grant persistence and verification source | Reuse candidate; test against new local identity and worker scope model |
| Domain models | `backend/models/_shared.js` | `createScopedStore` allocates Maps; an externalStore field alone does not establish durable CRUD | In-memory default; replace production persistence explicitly |
| Service scaffolding | `backend/services/orchestrator/src/services/orchestrator.service.js` | Default model construction and injected clients | Partial service layer; not proof of distributed deployment or autonomous intelligence |
| Orchestration | `backend/modules/orchestrator/src/run.ts`, `transitions.ts` | Run lifecycle and bounded counters; `private runs = new Map` | Partial/in-memory execution state; production authority must move to PostgreSQL |
| Goal verification | `backend/modules/orchestrator/src/verification.ts` | Evidence claim binding, freshness/conflict handling, required-criterion aggregation | Useful partial logic; does not itself execute independent acceptance tests or establish byte-level artifact evidence |
| Approval policy | `backend/modules/policy/src/approvals.ts`, `runtime.ts` | Authenticated owner abstraction, tenant and digest checks | Valuable reusable invariants; qualify four new autonomy modes and atomic effect consumption |
| Tool dispatch | `backend/modules/tools/src/dispatch.ts` | Registry, effect journal, budget and sandbox dependencies | Partial; inspected input validator checks required/top-level fields, not full nested type semantics. Replace with strict full-schema validation |
| Windows isolation | `backend/modules/sandbox/src/windows.ts` | Backend named `windows-unavailable`, throws on execution, reports `qualified: false` | Missing executable isolation; keep refusal until hostile-code qualification passes |
| Provider layer | `backend/modules/models/src/providers.ts` | Adapter, model, capability, invocation and usage types | Contract foundation; types do not establish any live provider/account conformance |
| Memory | `backend/modules/memory/src/query.ts`, `backend/models/vector.model.js` | Scoped SQL, context setup, vector validation for 1536 dimensions | Partial; real extension availability and end-to-end retrieval unverified |
| PostgreSQL | `backend/database/migrations/postgres/001-control.sql`, `004-memory-rls.sql` and later migrations | Runs, effects, outbox, budgets, memory, identity and qualification schemas | Implemented migration source; no database was inspected or migrated in this task |
| Migration runner | `backend/database/migrate.js` | Checksum/advisory-lock runner reads deleted JSON ledgers and package manifests | Retained historical source, currently non-runnable under cleanup. Replace manifest inputs without weakening migration review |
| Episodic storage | `backend/database/migrations/sqlite/001-episodes.sql`, `backend/modules/episodic/` | Separate SQLite storage design and source | Preserve as import source; target uses PostgreSQL for simpler local ownership |
| Scheduling | `backend/database/migrations/postgres/006-schedules.sql` | Schedule schema source | Partial evidence only; timezone/restart behavior not established |
| Tests | `backend/tests/http-foundation.test.js`, `database.test.js`, `lifecycle.test.js`, `backend/modules/*/test/` | Backend unit/integration/security test source | Retained; not executed during documentation reset |
| Model coverage tests | `backend/tests/models/all-models.test.js` | Reads JSON implementation/ownership maps | Broken inputs after requested deletion; replace ledger-count checks with behavior tests |
| Frontend | Historical `apps/openclaw/src/api/*`, `apps/gateway-fixture/src/*`, `tests/ui/*`, `scripts/run-applet.mjs` | Client adapters, synthetic gateway, UI tests and launcher | Removed. README referenced Next.js UI and packages not all present in this checkout; do not claim a complete UI source existed |
| Configuration | `.env.example`, `infra/policies/default.yaml` | Database/env keys; old observe/assist/execute mode policy | Retained migration inputs. Three old modes conflict with new four-mode product contract |
| Deployment | Historical `infra/windows/services.example.json`, retained service launch sources | Multi-service process proposal | Removed JSON config; no installed service or production deployment verified |
| Third-party source | `third_party/openclaw/` | Vendored backend helper/library code | Retained source and LICENSE; notice text preserved as `.txt`. Audit usefulness/licensing before future packaging |

## Inventory conclusions

**Implemented source:** transport/middleware foundations, contracts, policy helpers, SQL migrations, memory query code, tests. “Implemented source” means code exists, not that its production behavior was demonstrated.

**Partial:** production composition, identity lifecycle, persistent model storage, orchestrator, provider adapters, verification, memory qualification, schedule execution.

**Mocked/volatile:** synthetic gateway (removed), default Map stores, process-local orchestrator state. Tests using those components prove local behavior only.

**Missing or unqualified:** Windows hostile-code execution, the complete idea-to-approved-contract-to-verified-application workflow, externally qualified coding adapters, independent product acceptance pipeline, supported release packaging, restore evidence.

**Conflicting:** eight independently deployed services as the default; legacy three-mode policy; separate SQLite durability without a demonstrated need; old UI API as the long-term product boundary. These are migration decisions, not reasons to delete all working backend logic.

## Reuse matrix

| Source group | Target | Migration test |
| --- | --- | --- |
| Express config/middleware/shutdown | `backend/src/bootstrap`, `http`, `platform/config` | Origin/CSRF/session errors, occupied port behavior, bounded shutdown |
| Identity/policy/budgets/audit | `modules/identity`, `governance`, `operations` | Approval replay, revocation, concurrent overspend, scope escape |
| Control migrations/outbox/leases | `database/migrations`, `modules/orchestration` | Crash before/after each commit; stale lease cannot write |
| Model/provider/privacy types | `modules/providers` and `platform/providers` | Capability and privacy conformance against a real provider |
| Memory/query/provenance | `modules/memory` | Cross-scope denial, correction/expiry, real pgvector retrieval |
| Goal/evidence helpers | `modules/verification` | Evidence pinned to bytes/commit; required unknown blocks success |
| Tool and sandbox ports | `modules/tools`, `platform/execution` | Strict input validation plus actual VM isolation |
| Existing service wrappers | Domain ports where useful | No direct imports of another module's repositories |
| Legacy SQLite episodes | Resumable PostgreSQL importer | Stable IDs, counts, checksums, provenance preserved |

## Migration rules

1. Restore manifests only as a deliberate first implementation task; this documentation change does not recreate JSON files.
2. Capture a passing baseline for reusable components after restoring tooling. Missing fixtures must be reconstructed from behavioral requirements or recovered individually from Git.
3. Keep old SQL migrations immutable if ever applied to a real store. Create a new target schema and explicit importer or forward migrations; never edit applied history.
4. Do not assume a local database is empty. Inventory it read-only and back it up before any data migration.
5. Import data in scoped batches with a source ID/checksum mapping and restart cursor. Validate referential integrity and ownership before cutover.
6. Cut over one application port at a time. Disable legacy alternate writers after validation.
7. Retire obsolete source only when behavior is covered and data recovery is rehearsed. Retained source is not a commitment to run eight services.

The [cleanup record](00-CLEANUP-RECORD.md) lists removed tracked paths. Git history remains available. No commits, force pushes, or database mutations were performed.
