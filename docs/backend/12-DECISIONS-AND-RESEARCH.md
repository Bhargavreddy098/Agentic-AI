# Technical decisions, research, and uncertainty register

Reviewed 2026-10-22. External sources below were opened during this task; they support technology capabilities, not proof that this repository implements them. Recommendations are architecture judgments based on those capabilities and the repository audit. Exact dependency patches and account-specific entitlements remain implementation-time qualifications.

## Major decision records

Each record states why/problem, alternatives, selection rationale, dependencies, risks, implementation order and acceptance. User-fixed stack choices remain Node.js, Express, PostgreSQL and pgvector.

### D01 — Modular control plane with isolated workers

- **Why/problem:** shared approval/budget/effect transactions need consistency; eight independent services add operational failure paths before the first working workflow.
- **Alternatives:** current eight-service proposal; single unrestricted process; modular monolith with security worker boundary.
- **Selected:** modular monolith for trusted domain logic, separate dispatcher entry point, broker/guest isolation. Keeps transactions understandable while containing untrusted execution.
- **Dependencies:** explicit domain ports and ownership, database unit-of-work, capability protocol.
- **Risks:** modules can become tightly coupled; shared release has a wider trusted-process blast radius.
- **Order:** stages 01–05 establish boundaries, 07 dispatcher, 10–11 isolation.
- **Acceptance:** dependency checks prevent private cross-module imports; worker lacks DB credentials; end-to-end transaction/failure tests pass. Extract services only for measured scaling/isolation needs.

### D02 — Node.js/Express with checked JavaScript

- **Why/problem:** meet the requested stack while retaining working JS and TS foundations.
- **Alternatives:** full TypeScript rewrite, NestJS, Fastify, JavaScript without checking.
- **Selected:** Node 24 LTS, Express 5, ES modules, checked JSDoc plus strict runtime schemas; retain TS where already useful. Low migration cost and explicit control over middleware/lifecycle.
- **Dependencies:** pinned supported patches, type/lint/test setup, schema conventions.
- **Risks:** JavaScript type coverage can drift; Express requires disciplined error/security composition.
- **Order:** stage 01.
- **Acceptance:** build/check and HTTP failure tests pass; no unsafe implicit globals; promise errors serialized safely. Official [Node releases](https://nodejs.org/en/about/previous-releases) and [Express error handling](https://expressjs.com/en/guide/error-handling/) establish the chosen runtime/framework capabilities.

### D03 — PostgreSQL as the durable authority, SQL-first access

- **Why/problem:** contracts, approvals, costs and tasks require relational constraints and atomic transitions.
- **Alternatives:** document database; full event sourcing; ORM-first model; SQLite-only local store.
- **Selected:** one PostgreSQL database with domain schemas, `pg`, explicit SQL repositories and immutable audit/event records beside current state. This exposes locks, RLS and vector SQL without hiding semantics behind an ORM.
- **Dependencies:** qualified Windows server, role provisioning, migration/checksum runner, backup.
- **Risks:** local install footprint, SQL maintenance and migration errors; correctness requires transaction discipline.
- **Order:** stage 02; add feature tables with each feature, not all at once.
- **Acceptance:** real integration tests for scope/CAS/locks/restart and restore pass. [node-postgres transactions](https://node-postgres.com/features/transactions), [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

### D04 — Narrow PostgreSQL workflow core initially

- **Why/problem:** long-running work must survive restart without introducing unnecessary local infrastructure.
- **Alternatives:** Temporal; BullMQ/Redis; in-memory async loops; general DAG framework.
- **Selected:** bounded state machine, task queue, effects, checkpoints and outbox in PostgreSQL. This aligns with existing control schema concepts and one-store local deployment. It is a deliberate engineering responsibility, not free durability.
- **Dependencies:** schema/CAS/leases, effect identity, crash test harness.
- **Risks:** custom timer/recovery/versioning bugs; growing distributed scope can exceed the design.
- **Order:** stage 07, qualified before execution.
- **Acceptance:** crash matrix passes; no lost accepted tasks or duplicate high-impact effect; unknown outcomes blocked. Reassess Temporal if complex remote workflows or repeated recovery defects emerge. Temporal offers durable workflow concepts and a TypeScript SDK, but brings a service deployment and deterministic workflow constraints. [Temporal workflows](https://docs.temporal.io/workflows), [TypeScript SDK](https://docs.temporal.io/develop/typescript).

BullMQ is not selected or required in this plan. A future broker comparison must verify its current official behavior; no unverified claim of exactly-once queue execution is used here. Existing Redis-related source is migration input, not a new dependency mandate.

### D05 — Relational memory plus pgvector and full-text search

- **Why/problem:** semantic recall is useful but cannot own provenance, approvals, access or deletion.
- **Alternatives:** vector database for all memory; external vector service; graph database first.
- **Selected:** relational memory/revisions, exact IDs/full-text, optional pgvector ANN, relational graph. One durable store reduces synchronization complexity.
- **Dependencies:** scope-aware schema, embedding provider/space, provenance and deletion pipeline.
- **Risks:** ANN recall with selective filters, stale embeddings, mixing model spaces, private cache leakage.
- **Order:** schema foundation 02, full feature 14.
- **Acceptance:** no unauthorized retrieval; correction/deletion enforced; exact-vs-ANN benchmark passes; embedding migration resumable. [pgvector official repository](https://github.com/pgvector/pgvector) documents approximate filtering and iterative-scan behavior.

### D06 — Windows-hosted VM boundary for untrusted execution

- **Why/problem:** generated code and dependency install scripts cannot inherit the user's machine privileges.
- **Alternatives:** unrestricted child process; restricted tokens/Job Objects alone; WSL2/Docker as an assumed boundary; qualified Hyper-V-backed guest.
- **Selected:** broker-controlled disposable guest with explicit mounts/egress and qualification; Windows Sandbox is an experiment candidate, not predeclared production automation.
- **Dependencies:** supported edition/hardware, guest image, broker protocol, artifact transfer and tests.
- **Risks:** local hardware/edition availability, guest lifecycle complexity, exposed host integration.
- **Order:** 10 before coding execution.
- **Acceptance:** hostile-code/path/egress/cancellation/restart suite passes on actual Windows target. [Microsoft Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/) supports the virtualization premise; the precise ASI broker is still to be built.

### D07 — Secret references and native protected storage

- **Why/problem:** provider and cloud credentials must not flow through LLM-visible data.
- **Alternatives:** plaintext `.env` as production vault; encrypted DB with key stored beside it; OS-protected secret adapter.
- **Selected:** reference-only domain model, trusted resolver, user-bound DPAPI/qualified credential store, restrictive ACLs.
- **Dependencies:** native bridge, ownership model, recovery/rotation design.
- **Risks:** same-user compromise, service identity mismatch, key recovery across machines.
- **Order:** 03 foundations; 06 real credential use.
- **Acceptance:** canary leakage tests pass; restart/service identity and restore tested; no credential read endpoint. [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).

### D08 — Provider-neutral inference and replaceable coding adapters

- **Why/problem:** the orchestrator must remain authoritative when vendors/models change.
- **Alternatives:** one universal provider wrapper; direct platform internals; one coding agent owning the plan.
- **Selected:** separate provider and coding execution ports, capability registry, hard-filter router, per-adapter qualification.
- **Dependencies:** secret/runtime boundaries, schema validation, budget ledger and official surfaces.
- **Risks:** SDK drift, entitlement gaps, differing tool/cancellation semantics, misleading compatibility claims.
- **Order:** provider 06, first coding backend 11, others 18.
- **Acceptance:** conformance suite and failure tests pass; unsupported capability returns unavailable. [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [Ollama API](https://docs.ollama.com/api/introduction).

### D09 — Immutable contracts and external policy authority

- **Why/problem:** broad old approval must not authorize changed scope or sensitive external effects.
- **Alternatives:** mutable plan with an approved flag; prompt-based permission; unconditional full-autonomy mode.
- **Selected:** immutable canonical revision/digest, separate contract vs effect approval, deterministic policy and one-time sensitive-effect authorization.
- **Dependencies:** local identity, canonicalization, database constraints, exact action preview.
- **Risks:** digest inconsistency, TOCTOU, confusing approval UX, overly broad scope.
- **Order:** 05 and 09 before public execution.
- **Acceptance:** changed fields invalidate approval, replay fails, worker cannot impersonate owner, grant revocation blocks next dispatch. This is a product security design derived from the source vision, not a claim from a vendor SDK.

### D10 — Independent evidence-based verification

- **Why/problem:** plausible artifacts and agent success claims can conceal broken requirements.
- **Alternatives:** trust worker exit status; model self-review; test count only.
- **Selected:** criterion-level checks in a separate verifier authority, clean environment, byte-level artifact binding, explicit unknown outcomes and product review.
- **Dependencies:** immutable requirements, artifact store, qualified runtime, protected suite.
- **Risks:** incomplete criteria, flaky tests, rubric bias, test-overfitting.
- **Order:** 12 before MVP completion.
- **Acceptance:** seeded broken artifacts and tampered evidence are rejected; required missing checks block; one real app passes the full acceptance chain.

### D11 — REST plus durable SSE

- **Why/problem:** clients need inspectable operations and recoverable long-run progress.
- **Alternatives:** WebSockets for all traffic; provider-token stream as truth; polling every resource.
- **Selected:** REST mutations/resources, 202 operation handles, SSE from persisted ordered run events. Internal worker messages remain separate.
- **Dependencies:** session/CSRF, event persistence, sequence allocation, backpressure.
- **Risks:** reconnect gaps, slow-client memory growth, stale sessions.
- **Order:** HTTP foundation 01–04, SSE 07.
- **Acceptance:** snapshot/reconnect race and retention-expiry tests pass; no secrets in streams; revocation terminates access. Protocol behavior is specified in [API contracts](05-API-CONTRACTS.md).

### D12 — Local immutable artifact storage, later object storage

- **Why/problem:** source snapshots/logs/screenshots/builds are large and require integrity/provenance.
- **Alternatives:** all blobs in PostgreSQL; arbitrary user filenames; cloud storage required from day one.
- **Selected:** scoped content-addressed local blobs with metadata in PostgreSQL, staged ingest and quarantine; storage port enables later object storage.
- **Dependencies:** ACL/path validation, digest verification, quotas and backup inventory.
- **Risks:** DB/blob divergence, disk exhaustion, unsafe active content, backup inconsistency.
- **Order:** 04.
- **Acceptance:** interrupted upload never becomes available; digest mismatch fails; restore validates every referenced retained blob.

### D13 — Lightweight specialist sessions and bounded critique

- **Why/problem:** expert review can improve important decisions, but unrestricted agent conversation burns time/cost.
- **Alternatives:** dozens of permanent agents; one prompt for everything; free-form debate.
- **Selected:** dynamic scoped roles with typed deliverables, maximum rounds/fanout/depth, measured benefit and an orchestrator decision record.
- **Dependencies:** provider/router, context, budget, task schemas and evaluation.
- **Risks:** correlated model mistakes, false consensus, repeated debate and role inflation.
- **Order:** simple roles in 08–09; advanced agents only after 13 and evaluation.
- **Acceptance:** benchmark shows useful defects caught or omission reduction versus baseline within budget; no role gains permission through debate.

### D14 — Persisted schedules and signed event inbox

- **Why/problem:** recurrence and webhooks must survive downtime and duplicate delivery safely.
- **Alternatives:** process-local cron timer, external scheduler from day one, immediate event-to-shell execution.
- **Selected:** durable recurrence/occurrence rows and inbox dedup feeding normal governed goal/run lifecycle.
- **Dependencies:** durable engine, grants, budgets, timezone parser and signature adapters.
- **Risks:** DST ambiguity, catch-up storms, stale grants and replay attacks.
- **Order:** 15.
- **Acceptance:** timezone/restart/overlap/replay tests pass; one unique occurrence produces at most one logical execution; unknown external effects still reconcile.

## Comparative lessons

| System/category | Useful lesson | Applicable here | What ASI should do differently |
| --- | --- | --- | --- |
| Codex SDK/app-server | Programmatic coding sessions and richer client protocol | Replaceable execution adapter | Keep requirements, approval/cost and independent completion in ASI |
| Claude Agent SDK | Agent lifecycle/tools through a supported interface | Second worker after conformance | Do not let its tool policy substitute for ASI's broker boundary |
| Temporal | Durable workflow/history and activity separation | Recovery concepts; future distribution prototype | Avoid mandatory additional service for the first narrow local workflow unless experiments justify it |
| Ollama | Local model service behind documented endpoints | Private/local inference option | Evaluate actual model capability and hardware limits; local is not automatically competent or safe |
| Playwright | Isolated browser contexts and repeatable automation | Guest-based QA/evidence | Add OS isolation, action approvals and credential boundaries beyond browser context separation |

OpenHands, OpenClaw, Hermes and T3 Code are optional future research comparisons. This task does not claim to have independently reviewed those systems. Vendored OpenClaw helper code in this repository is not evidence that ASI has their complete capabilities. Avoid importing a large framework merely to claim similarity.

## Technical uncertainty and experiments

| Question | Experiment / evidence needed | Safe behavior until resolved |
| --- | --- | --- |
| Which Windows guest backend is operable unattended? | Lifecycle/IPC/egress/artifact/cancellation prototype across supported editions | Plan-only; executable tools unavailable |
| Does the chosen coding adapter enforce limits and return enough usage/evidence? | Conformance suite on actual account and pinned SDK | Disable unsupported capabilities |
| Are model capability metadata trustworthy? | Small controlled schema/tool/context probes, budgeted | Unknown capability excluded by router |
| Is custom workflow maintenance acceptable? | Fault suite plus recovery complexity review after MVP | Keep bounded scope; consider Temporal prototype |
| Does filtered ANN meet retrieval targets? | Exact vs HNSW recall/latency across scoped datasets | Exact authorized search |
| Can secret recovery work on a new Windows account/host? | Explicit encrypted export/recovery rehearsal | State restore limitation; do not promise portability |
| Does multi-agent review outperform single review? | Frozen tasks, repeated trials, cost/defect comparison | One planner plus independent verifier |
| Can existing code be reused safely? | Baseline behavior tests and production composition audit | Retain as reference; no claimed capability |

## Research boundaries

Official documentation can change. Preserve dated capability/pricing snapshots when implementing, recheck supported SDK/auth flows, and record exact qualified versions. No live provider account, database server, Windows guest or deployment was provisioned by this documentation task. All performance targets, architecture choices and release gates are proposed requirements, not measured outcomes.
