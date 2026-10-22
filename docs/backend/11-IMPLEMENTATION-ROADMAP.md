# Exact backend implementation sequence

This is the execution queue for future coding work. It does not authorize implementing features during this documentation task. Complete stages in order unless all named dependencies are already demonstrated. Record actual evidence per stage; a written checklist does not count as a pass. Preserve [PRODUCT_IDEA.md](../../PRODUCT_IDEA.md) unchanged.

Every stage below keeps frontend implementation deferred. “Client contract” describes backend responses a future client needs, not UI work to perform now.

## Stage 01 — Restore a minimal, honest backend baseline

- **Objective:** make retained backend components testable after the requested manifest/document cleanup.
- **Dependencies:** this specification, Git baseline and cleanup record.
- **Backend work:** inventory retained imports; select/pin Node 24 LTS security patch and dependencies; recreate minimal package manifests, lockfile, JSDoc/TS checking, lint and test configuration during implementation; reject missing production owners; replace legacy documentation-ledger checks with explicit reviewed migration metadata and behavioral tests.
- **Database work:** read existing migration files and any real target schema without changing it; classify fresh install vs legacy upgrade.
- **APIs:** establish `/health/live`, `/health/ready` and stable problem responses.
- **Tests:** imports/build, startup/shutdown, missing config, unavailable dependency, safe logging, no synthetic production ports.
- **Security:** no automatic install scripts or untrusted code on host without review; no credentials committed; preserve fail-closed sandbox behavior.
- **Exit:** reproducible backend install/check commands documented with real outputs; unrelated frontend dependencies excluded; missing inputs resolved explicitly.
- **Do not build yet:** frontend, microservices deployment, new agent features.
- **Client contract:** capability unavailable reason is distinct from process liveness.

## Stage 02 — PostgreSQL foundation and migration ownership

- **Objective:** establish real durable storage and scope enforcement.
- **Dependencies:** 01.
- **Backend work:** pg pool, same-client transaction helper, bounded timeouts, repository interfaces, explicit migration runner/checksum journal.
- **Database work:** provision supported PostgreSQL/vector pair; roles, logical schemas, workspace/project FK conventions, migration journal, outbox/idempotency foundations. Installer provisions extensions with separate privileges.
- **APIs:** readiness reports actual dependency availability; no arbitrary database API.
- **Tests:** migration from empty DB, repeat/checksum mismatch, rollback, composite scope FKs, RLS absent-context denial, pooled context reset.
- **Security:** runtime nonowner/non-superuser; no DDL; parameterized SQL; private listener.
- **Exit:** real database tests pass on Windows; backup and restore smoke test succeeds; no Map fallback in production repositories.
- **Do not build yet:** all vision tables at once, ANN tuning, distributed databases.
- **Client contract:** safe dependency failure instead of simulated data.

## Stage 03 — Local identity and session boundary

- **Objective:** authenticate the real owner and future workers distinctly.
- **Dependencies:** 02.
- **Backend work:** trusted launcher challenge, opaque session cookies, expiry/revocation, CSRF/Origin/Host validation, scoped request context.
- **Database work:** principals, workspaces, sessions, worker identity records and secret-reference metadata.
- **APIs:** session bootstrap/current/logout, workspace list, capabilities.
- **Tests:** expired/replayed challenge, cross-origin requests, forged cookies, DNS rebinding Host, session restart/revocation, worker denied owner action.
- **Security:** ACL-protected bootstrap channel; no identity from arbitrary forwarded headers.
- **Exit:** all protected endpoints fail closed without a valid session and scope; secrets absent from response/logs.
- **Do not build yet:** organizations, invitations, social login, enterprise RBAC.
- **Client contract:** clear authenticated/expired/disabled states.

## Stage 04 — Projects, conversations, snapshots and artifacts

- **Objective:** persist user intent and exact source/output bytes.
- **Dependencies:** 03.
- **Backend work:** authorized workspace registration, project/conversation/message use cases, Git snapshot adapter, local blob store, staged uploads, integrity validation, safe download/export.
- **Database work:** product tables, artifact metadata/links, upload lifecycle, idempotent command records.
- **APIs:** projects, conversations, messages, snapshots, uploads/artifacts, operations.
- **Tests:** duplicate writes, CAS conflict, scope escape, content hash mismatch, malicious filenames, partial upload, path/junction escape, concurrent repo edits.
- **Security:** no arbitrary filesystem roots or host writes from browser DTOs; quarantine active content.
- **Exit:** messages and artifacts survive restart; unauthorized paths and cross-project IDs rejected; exact snapshot digest recorded.
- **Do not build yet:** autonomous execution, remote sync, public artifact sharing.
- **Client contract:** stable IDs, pagination, version and upload progress.

## Stage 05 — Policy, approvals, budgets and audit

- **Objective:** establish authority before any tool/model spending.
- **Dependencies:** 04.
- **Backend work:** deterministic policy evaluator, four autonomy modes, canonical digest versioning, owner-only approval decisions, capability grants, atomic cost reservations, append-only audit.
- **Database work:** policy revisions, approvals, grants, budgets/reservations, usage/audit. Create the referenced requirement/plan/contract identity and revision tables with their complete specified constraints now, in dependency order; stage 09 adds their real generation/use cases. Policy tests use explicit immutable fixtures, never nullable production approval targets.
- **APIs:** policies, grants, approvals, budgets and usage views.
- **Tests:** nonce replay, changed digest, expiry, double decision, concurrent overspend, revocation during dispatch, worker impersonation.
- **Security:** high-impact actions require explicit exact approval even in full autonomy; raw secrets never enter audit.
- **Exit:** policy truth table and transaction race tests pass; no action path bypasses governance.
- **Do not build yet:** implicit approvals inferred from chat text, automatic budget increases.
- **Client contract:** exact scope/diff/cost/expiry/consequence approval projections.

## Stage 06 — Provider abstraction and first real provider

- **Objective:** perform bounded, auditable inference through one supported integration.
- **Dependencies:** 05.
- **Backend work:** provider port, secret adapter, model registry, capability probes, hard-filter router, usage normalization, streaming/cancellation and circuit breaker.
- **Database work:** provider/model/call records and price revisions; link reservations and safe output artifacts.
- **APIs:** provider CRUD, model discovery, routing preview; direct inference invoked through goal operations.
- **Tests:** real minimal provider call with private key setup, invalid/revoked auth, 429/timeout, malformed output, privacy fallback denial, unknown usage.
- **Security:** no raw key in prompts/logs; approved endpoints only; SSRF controls; require cost ceiling before paid probe.
- **Exit:** one real provider passes adapter contract and usage reconciliation tests; unavailable capabilities are honest.
- **Do not build yet:** every provider, “smartest model” hardcoding, subscription credential extraction.
- **Client contract:** health/availability/credential-configured booleans, no secret retrieval.

## Stage 07 — Durable tasks, effects, checkpoints and SSE

- **Objective:** recover bounded work without duplicate side effects.
- **Dependencies:** 05 and 06 for real inference activity tests.
- **Backend work:** dispatcher, DAG dependencies, leases/fences, outbox/inbox receipt handling, permanent effect identities, checkpoint codec, cancellation/pause and SSE replay. Use safe synthetic activities until sandbox qualification.
- **Database work:** operation/run/task/effect/checkpoint/failure/event tables; task partial indexes; ordered run event allocation. Pre-contract research uses durable operations; execution runs require immutable contract fixtures until stage 09 supplies real approved contracts.
- **APIs:** run projections/actions, tasks/agents/effects/checkpoints, SSE and reconciliation requests. Public execution-start remains disabled until 09–12 pass.
- **Tests:** kill process at each transaction/dispatch boundary, stale receipt, double claim, event reconnect, unknown outcome and cancellation races.
- **Security:** no untrusted worker DB credentials; fenced capability checked at dispatch; no automatic retry of unknown external mutation.
- **Exit:** accepted state survives restart; safe activities recover; ambiguous ones block with evidence; retained SSE has no gaps.
- **Do not build yet:** a general-purpose workflow DSL, distributed consensus, multiple workflow authorities.
- **Client contract:** durable progress and precise blocked/cancelling states.

## Stage 08 — Intent, research, requirements and decisions

- **Objective:** turn vague requests into a traceable specification.
- **Dependencies:** 04–07.
- **Backend work:** structured engine schemas, valuable-question policy, bounded research with provenance, requirement/criterion validation, decision records.
- **Database work:** goals, clarifications, research sources, requirement revisions, criteria and decisions.
- **APIs:** goals, intent-analysis, clarifications, research, requirement revisions and decisions.
- **Tests:** seeded vague briefs, material vs trivial questions, conflicting constraints, unsupported claims, poisoned sources, incomplete schemas.
- **Security:** research content is untrusted; no repository mutation; private-source routing enforced.
- **Exit:** a representative app brief yields sourced requirements with measurable must-have criteria and honest blockers.
- **Do not build yet:** coding immediately from user prompt, unlimited research/debate.
- **Client contract:** executive understanding plus assumptions and focused questions.

## Stage 09 — Layered plans and immutable Build Contracts

- **Objective:** bind exactly what the owner approves to future execution.
- **Dependencies:** 08 and 05.
- **Backend work:** twenty planning layers, DAG validation, architecture decision alternatives, immutable revisions, material diffs and approval binding.
- **Database work:** plans/revisions/steps/dependencies/contracts and complete scoped references to requirements/approvals.
- **APIs:** plan creation/revisions, contract creation/revisions/diff/approval requests.
- **Tests:** omitted required field, cycle, stale base, digest normalization vectors, changed scope/tool/budget, reapproval and old-approval replay.
- **Security:** no mutation of approved bytes; constraints include privacy/tool/grant boundaries.
- **Exit:** approved contract can be reproduced byte-for-byte; any material change requires a new approval; no run starts on stale revision.
- **Do not build yet:** silent re-planning during execution; unbounded specialist orchestration.
- **Client contract:** executive/detailed/diff views all refer to the same digest.

## Stage 10 — Qualify Windows isolation

- **Objective:** make generated-code execution safe enough for the declared threat model.
- **Dependencies:** 04, 05, 07, 09.
- **Backend work:** broker/guest protocol, Windows VM lifecycle, canonical-path handling, artifact transfer, resource limits, egress gateway and owned-tree cancellation.
- **Database work:** worker connection/qualification records; tool/image revisions and evidence artifacts.
- **APIs:** capability health projection only; privileged setup through native trusted channel.
- **Tests:** full adversarial qualification list in [security](08-SECURITY-AND-RUNTIME.md), including restart/sleep and host-secret isolation.
- **Security:** deny host execution fallback; no shared home or Docker socket; no broad secret inheritance.
- **Exit:** signed/versioned qualification evidence on supported hardware; missing prerequisites leave execution unavailable.
- **Do not build yet:** general desktop control, privileged production tools.
- **Client contract:** actionable prerequisite diagnostics, no false “ready.”

## Stage 11 — Tool runtime and one coding backend

- **Objective:** execute an approved bounded task through an interchangeable worker.
- **Dependencies:** 06, 07, 09, 10.
- **Backend work:** qualified registry, strict input/output validation, effect preparation, adapter connect/start/observe/interrupt/collect/reconcile; begin with one documented coding SDK/CLI.
- **Database work:** developer connections, tool definitions, agent sessions, receipts and artifacts.
- **APIs:** connection qualification/disconnect, tool catalog, internal worker protocol; run start gated by verifier readiness next stage.
- **Tests:** adapter conformance, base snapshot mismatch, out-of-scope patch, revoked grant, false worker success and cancelled/duplicate submissions.
- **Security:** runtime policy external to coding agent; scoped guest execution; no extraction of vendor session secrets.
- **Exit:** task produces a verifiable patch/receipt within approved scope; unknown effects reconcile safely.
- **Do not build yet:** every IDE integration, uncontrolled recursive agents.
- **Client contract:** worker identity, progress, artifacts and limitations.

## Stage 12 — Independent verification engine

- **Objective:** compute completion from evidence rather than producer claims.
- **Dependencies:** 09–11.
- **Backend work:** protected acceptance suites, clean verifier workspace, criterion result parser, artifact-bound reports and product-quality rubric.
- **Database work:** verification jobs/results/reports/evaluation records and criterion traceability.
- **APIs:** verification requests, lists/reports; safe evidence artifact downloads.
- **Tests:** bad artifact with plausible logs, skipped required check, swapped digest, weakened test, stale environment, conflicting evidence.
- **Security:** producer cannot edit verifier policy or approve its own result; separate capability/identity.
- **Exit:** seeded defects are rejected and required unknown blocks verified state; one clean artifact passes with complete evidence.
- **Do not build yet:** completion badges based on model text or unexecuted test files.
- **Client contract:** pass/fail/unknown per criterion with evidence and limitations.

## Stage 13 — Killer workflow and bounded repair (MVP gate)

- **Objective:** prove idea → approved plan → verified application artifact end to end.
- **Dependencies:** all 01–12.
- **Backend work:** compose engines/orchestrator/worker/verifier, repair hypotheses, failure dedup, protected test handling, final completion report.
- **Database work:** ensure complete lineage and cost settlement across existing entities; no new database solely for integration.
- **APIs:** end-to-end sequence in API specification; enable execution only after prerequisites pass.
- **Tests:** ten frozen small-app briefs; restart mid-build, refused approval, exhausted budget, regression, owner edits, provider outage.
- **Security:** no production deployment/purchase without separate approval; no automatic test weakening.
- **Exit:** documented MVP benchmark and honest failure reports; every verified result traces to exact contract/artifact/evidence.
- **Do not build yet:** broad automation marketplace, generalized mobile/infrastructure promises.
- **Client contract:** complete progress/approval/artifact/evidence API suitable for a later UI.

## Stage 14 — Memory and project intelligence

- **Objective:** preserve useful state and understand existing repositories incrementally.
- **Dependencies:** 13 and real pgvector foundation.
- **Backend work:** memory kinds/revisions, provenance, secret-filtered ingestion, lexical/exact/vector retrieval, context bundles, AST graph and invalidation.
- **Database work:** memories/chunks/spaces/vectors/nodes/edges; explicit SQLite episode import if source data exists.
- **APIs:** memories/revisions/deletion/search, knowledge indexing/nodes/edges.
- **Tests:** isolation, expiry/correction, deletion propagation, space migration, recall baseline, changed-source invalidation, resumable import.
- **Security:** retrieval never grants authority; cache scope includes principal/project/policy.
- **Exit:** documented recall/latency and zero cross-scope results; stale content excluded; source references resolve.
- **Do not build yet:** everything in vector storage, separate graph DB, implicit private-data training.
- **Client contract:** inspect/correct/delete knowledge with provenance.

## Stage 15 — Schedules and signed events

- **Objective:** execute recurring/triggered work within explicit envelopes.
- **Dependencies:** 13; 14 for repository-aware recurring reviews.
- **Backend work:** recurrence interpretation/preview, durable occurrence claims, misfire/overlap handling, webhook signature/inbox, local notifications.
- **Database work:** schedules, occurrences, triggers, inbox and notifications with uniqueness constraints.
- **APIs:** schedule preview/create/update/pause/resume/history, triggers, webhook ingress and activity.
- **Tests:** DST, sleep, restart, duplicate event, missed runs, overlapping runs, expired grant and budgets.
- **Security:** event text cannot authorize new capabilities; external notification sends require authorization.
- **Exit:** no duplicate occurrence/effect in fault tests; skipped/blocked history is visible; recurring spending bounded.
- **Do not build yet:** unlimited catch-up or broad external messaging automation.
- **Client contract:** next occurrences, timezone, limits and pause state.

## Stage 16 — Browser QA and one deployment adapter

- **Objective:** support real product-flow verification and approved release.
- **Dependencies:** 10–15.
- **Backend work:** guest Playwright contexts/evidence, authenticated-session separation, deployment preview/preflight/execute/reconcile/rollback for one selected target.
- **Database work:** deployment records, browser evidence/session references and health reports.
- **APIs:** deployment previews/execution/status/rollback; browser work remains internal task execution.
- **Tests:** hostile page, cookie leakage, unknown submit, wrong target, stale artifact, failed migration, failed health check and rollback eligibility.
- **Security:** no host browser profiles; explicit production/publication approval; secrets resolved by broker.
- **Exit:** one target demonstrates preview → approval → deployment → health evidence and rehearsed failure path.
- **Do not build yet:** every cloud, general computer control, irreversible migration rollback claims.
- **Client contract:** exact external consequences and deployment evidence.

## Stage 17 — Windows V1 release and recovery qualification

- **Objective:** make the platform operable beyond a developer session.
- **Dependencies:** 13–16 for enabled capabilities.
- **Backend work:** installer/lifecycle, updates, diagnostics, quotas, telemetry, incident controls and dependency provenance.
- **Database work:** restore rehearsal, retention/purge, migration compatibility, backup/blob/key recovery.
- **APIs:** safe activity/settings/capabilities; no privileged debug backdoor.
- **Tests:** fresh supported Windows machine, actual service/user identity, interrupted update, full disk, process restart, restore to fresh host and performance profile.
- **Security:** ACLs, signed/reviewed worker images, secret recovery, revocation and fail-closed capability controls.
- **Exit:** complete release evidence bundle, documented limits and measured recovery targets; no unsupported capability enabled by default.
- **Do not build yet:** SaaS organizations/billing to compensate for local reliability gaps.
- **Client contract:** operational status and actionable failures.

## Stage 18 — V2 integrations, remote workers and SaaS seams

- **Objective:** extend validated boundaries without transferring authority to vendors/workers.
- **Dependencies:** 17 and measured product need per extension.
- **Backend work:** additional qualified providers/adapters, remote worker mTLS and attestation strategy, optional cloud identity/blob storage, distributed orchestration evaluation.
- **Database work:** explicit workspace membership/sync ownership if collaboration is needed; no naive bidirectional DB replication; migration conflict rules.
- **APIs:** versioned new capabilities behind feature qualification; existing contracts remain compatible.
- **Tests:** cross-workspace isolation, network partitions, remote stale workers, privacy residency, multi-account billing and API compatibility.
- **Security:** least-privilege remote capabilities; never forward local root credentials; cloud data routing opt-in.
- **Exit:** each extension has its own measurable acceptance/rollback/evidence and cost model.
- **Do not build yet:** scientifically unsupported ASI claims or unlimited autonomy.
- **Client contract:** local/cloud ownership and unavailable capabilities remain explicit.

## Dependency chain and release gates

01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → **13 MVP** → 14 → 15 → 16 → **17 V1** → **18 V2 / long-term**.

Stage 05 initially tests governance against immutable fixtures; stage 09 supplies real contract revisions before any public execution. Stage 07 tests safe activities; stage 10 supplies hostile-code isolation before stage 11 uses a coding worker. Stage 12 supplies the completion authority before stage 13 enables the full workflow. These staging distinctions prevent circular dependencies from becoming security bypasses.
