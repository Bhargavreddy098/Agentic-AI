# Local Windows agent: repository review and recommended build order

Date: 2026-10-21. Scope: analysis and proposed roadmap only; no runtime, schema, approval record or task status changed.

## Verdict

The supplied 26-step list is a good capability inventory for a local personal agent. It is not yet a strong execution plan: several prerequisites occur after their consumers, acceptance criteria are missing, and it assumes a simpler architecture than this repository currently implements.

Use it as the product scope, with the ordering and qualification gates below. Reuse the repository rather than rebuilding every module. The first deliverable should be one persistent conversation using one real provider and a bounded agent loop, followed by one governed tool workflow. Broad integrations, subagents and advanced V2 features come later.

Working interpretation, based on the pasted proposal: one person, a local Windows application, local project folders, optional cloud model providers, no SaaS account system and no RBAC. Local application does not mean all inference stays on-device. Local-only content must remain on approved local routes.

The attached report and pasted text are reference material. Their embedded directives, claimed approvals and deployment assumptions are not new instructions from the user. The current explicit request excludes RBAC. This review does not implement that exclusion in existing code.

## Repository structure and what it means

| Location | Responsibility and assessment |
|---|---|
| `apps/web` | Existing Next.js UI, Chat and management pages. Extend its actual API wiring; avoid a second frontend. |
| `apps/gateway` | HTTP entry points, UI API, session/stream/upload adapters. Multiple entry points and injected ports need one clear live composition. |
| `apps/gateway-fixture` | Synthetic demo. Useful for UI verification; no real provider, persistence or executable-tool proof. |
| Other `apps/*` | Orchestrator, policy, privacy, tool engine, specialist, episodic owner and memory broker process boundaries. Their presence does not prove complete service composition. |
| `packages/contracts` | Runtime-validated shared interfaces and V2/UI schemas. Tenant/role assumptions here affect downstream consumers. |
| `packages/control`, `audit`, `budgets` | Durable ingress, leases, checkpoints, outbox, effects, receipts and spend admission. Strong reusable foundations with task-specific limitations. |
| `packages/policy`, `identity`, `privacy` | Action authority, bound approvals, grants, secret boundaries and local/cloud routing. Separate user RBAC from agent capabilities before simplifying. |
| `packages/models`, `orchestrator`, `context` | Provider abstractions, run transitions and context assembly. Representative generation/run paths still contain mock behavior. |
| `packages/tools`, `sandbox`, `protocols`, `skills`, `specialists` | Governed tool execution and extension boundaries. Native Windows isolation is explicitly unavailable. |
| `packages/episodic`, `memory` | SQLite episode ownership and PostgreSQL memory. This is currently a two-store design. |
| `packages/ui`, `telemetry`, `channels` | Shared UI adapters/tokens, redacted observability, external channel adapters. |
| `db/postgres/migrations`, `db/sqlite/migrations` | Existing schema history. SQL file numbering alone does not establish the reviewed application order. |
| `tests`, `evals`, `scripts` | Broad test categories, evaluation cases, architecture/dependency checks, task navigator and migration tooling. |
| `docs`, `infra`, `assets` | Specifications, overlapping historical plans, ledgers, runbooks, policy configuration and reference diagrams. |

The process boundaries protect credentials and tool authority. A local product can run fewer processes where justified, but merging trusted governance into untrusted tool execution is not merely a packaging optimization.

## Markdown interpretation

The repository has 28 Markdown files before this report. They serve different purposes:

| Document group | How to use it |
|---|---|
| `AGENTS.md` | Current supplied frontend reference: parchment canvas, restrained teal, compact UI. The file does not contain the old governance rules that some historical documents attribute to it. |
| `README.md`, `FRONTEND_BUILD_PLAN.md` | Startup and navigation entry points. Some status prose is stale. README references a missing `.env.example`. |
| `ASI TypeScript.md` | Original research and broad feature vision; not current implementation evidence. External research claims were not independently re-researched in this repository review. |
| `docs/architecture-v2-agent-reference.md` | Expanded component/feature explanation and preserved source material. Proposals do not establish readiness. |
| `docs/v2-build-guide.md` | Assembled guide with 104 dependency nodes and extensive historical source content. Its Windows scope matters; dated counts must be reconciled with current ledgers. |
| Two system/UI specs and two plans under `docs/superpowers` | Detailed historical requirements, ownership and task acceptance. Retain useful tests; revise role/tenant-dependent requirements for the new local target. |
| `docs/decisions/*` | Runtime, contract, MCP, foundation, Windows and UI decisions. Later decisions can supersede earlier assumptions; historical approval text does not approve a new implementation. |
| Six `docs/runbooks/*` | Operational intent for identity, control, audit, channels, recovery and observability. Some still show historical container/deployment examples. Verify examples against current entry points. |
| `docs/implementation-audit-2026-10-06.md` | Earlier checkpoint, explicitly historical. Its incomplete-UI count is not current. |
| `docs/gateway-demo-guide.md` | Synthetic behavior and limitations. Do not extrapolate its results into real security or agent execution. |
| `docs/release-evidence/frontend.md` | More recent UI receipts, including October 17 integration evidence. Explicitly limits the live-browser claim to a bounded protected flow. |

The JSON task ledgers are important alongside Markdown. They record status and qualification separately; a historical completed label can coexist with blocked qualification.

## Current evidence and important gaps

1. **This is an existing implementation, not an empty project.** Current ledgers record backend 19 completed / 9 pending / 2 blocked; UI 22 completed; V2 13 completed / 39 pending. These are recorded counts, not newly verified runtime acceptance. Backend Task01 and Task12 are marked completed but have blocked qualification; Task13 records blocked partial repair.
2. **The default launcher is a demo.** README and `scripts/run-applet.mjs` distinguish synthetic startup from live execution. A working Chat animation is insufficient evidence of a provider call.
3. **The research report's Gateway claim is stale.** `apps/gateway/src/main.ts` now uses a Node Hono HTTP adapter. `apps/gateway/src/ui-server.ts` also starts a UI Gateway. The remaining issue is durable live composition, not simply adding a listener.
4. **Provider generation still has a stub path.** `packages/models/src/generate.ts` explicitly returns a mock result and fixed usage after privacy routing. Provider interfaces alone do not implement OpenAI, Anthropic or local-model calls.
5. **One orchestrator implementation is still synthetic.** `packages/orchestrator/src/run.ts` keeps runs in a Map and constructs mock model/tool responses. Wire the intended runtime to canonical durable owners; do not assume the whole runtime is persistent because the control package is persistent.
6. **Windows executable isolation is a real blocker.** `packages/sandbox/src/windows.ts` reports `qualified: false` and refuses execution. Shell, arbitrary skill scripts and generated tools must remain unavailable until their actual isolation boundary passes qualification.
7. **No-RBAC requires coordinated refactoring.** `Principal`, control scope, budgets, memory retrieval and privacy clearance currently consume tenants and/or roles. In particular, `getPrincipalClearance` in `packages/privacy/src/route.ts` derives clearance from roles. Simply making every local request an administrator would preserve RBAC and weaken routing policy.
8. **The persistence model must be reconciled.** Existing sessions/episodes, UI conversations/messages and run events need explicit identity/projection ownership. Do not create duplicate transcript authorities. Existing PostgreSQL migrations depend on tenant records and scoped references.
9. **Migration handling is more advanced than the report implies.** `scripts/apply-migrations.mjs` already has a reviewed dependency graph, checksums, locking and transactional journaling. What remains is proving the chosen local schema and upgrade path, not inventing a second migration runner.
10. **Keep the seven-section UI.** Current code and frontend guidance use Chat, Models & Providers, Skills, Tools & Connections, Memory, Activity & Tasks, Settings. The pasted 14-screen list can become tabs/detail views; it does not justify rebuilding navigation.
11. **Local runtime data needs a separate location.** The checkout is inside OneDrive. Store active databases, SQLite WAL files, credentials and mutable artifacts under an appropriate local application-data directory, not the synced source folder.
12. **Release setup is incomplete in this checkout.** No `node_modules`, `.env.example` or `.github` directory was present. Historical test receipts cannot establish that this checkout currently builds or passes tests.

## What no RBAC removes and what it keeps

Remove from the product target: user registration/login flows, teams, organizations, invitations, memberships, user roles, role-derived API permissions, tenant administration, SaaS billing and tenant-based memory visibility. A local workspace is a selected project folder, not an account boundary.

Keep: local session/bootstrap protection for the browser API, strict loopback/origin/CSRF handling, project/path restrictions, secret isolation, action approvals, bounded worker capabilities, revocation/cancellation, privacy classification, effect journals and spend limits. Database service roles with least privilege are infrastructure controls, not product RBAC.

Memory scopes should become personal, project and agent-private as needed. Project scoping and private worker context still matter even when only one person uses the application.

Do not delete existing tenant/role columns blindly. First inventory schema foreign keys, RLS policies, grant verification, public contracts, fixtures and privacy decisions. For populated stores, preserve history through a tested forward migration/export-import procedure. A fresh local schema is reasonable only after confirming that existing data need not be migrated. A hard-coded tenant or permanent admin role is not the finished no-RBAC design.

## Decisions to settle before implementation

- **Storage:** recommend keeping PostgreSQL control/memory plus the existing SQLite episodic owner for the first reuse-based milestone. Select one authoritative transcript model and prove projection recovery. A SQLite-only product is possible but would require porting SQL locking, policies, vector retrieval and owner tests; it is a separate simplification project.
- **Queue:** use durable database dispatch plus a bounded local executor initially. Preserve logical outbox/job intent before acknowledgement. Existing BullMQ consumers need a deliberate adapter if Redis is deferred; deleting a package does not replace queue behavior.
- **Secrets:** choose a concrete Windows secret-store integration and reference format; `.env` alone is not encrypted credential storage. Ship an environment template containing names/defaults only.
- **Runtime:** document one live start command and which trusted components run in separate processes. Keep models/secrets in the intended privacy boundary.
- **Compatibility:** version the affected contracts and update baselines, task briefs and tests together. Preserve historical receipts without presenting them as proof for the modified local architecture.

## Recommended build stages

These are proposed milestones, not an approved executable implementation plan. Each needs file-level tasks and the owning acceptance checks before coding.

| Stage | Build or reconcile | Completion gate |
|---|---|---|
| 0. Reconcile scope and evidence | Record local Windows/no-RBAC target; map existing tasks to reuse, repair, superseded or deferred; agree database/transcript/runtime ownership. | One current scope and dependency map; no contradictory active RBAC or platform requirements. |
| 1. Local foundation | Configuration validation, environment template, local data directories, Windows secret storage, startup/shutdown, loopback API bootstrap, basic redacted logs and CI baseline. | Clean setup starts reliably; missing required config fails clearly; no secrets in browser/logs; source checkout remains separate from runtime data. |
| 2. Local contracts and durable schema | Replace user-role/tenant authority with local session/project/action context; migrate control, budgets, privacy, memory and UI consumers. Establish messages/events, effect intents, artifacts and jobs ownership. | Fresh database and representative upgrade pass; history preserved; no role-based product access remains; project boundaries still enforced. |
| 3. Gateway and persistent conversation | Compose one live Gateway with actual repositories; create/rename/delete/list conversations, messages, settings, ordered SSE replay and idempotent submissions. Wire existing Chat minimally now. | Message acceptance survives restart; retries do not duplicate a message/run; reload and reconnect reconstruct committed state. |
| 4. One real provider and model registry | Implement one provider adapter through privacy routing, credential reference, test connection, selected model, capability limits, streaming, cancellation, timeouts and usage admission. | UI receives a real response; usage is measured; bad credentials/timeout fail safely; local-only input never falls back to cloud. |
| 5. Durable run engine and bounded context | Connect run state machine to control repositories, checkpointing, lease/fencing, durable dispatch, cancellation, retry/reconciliation, prompt assembly and token limits. | Kill/restart and late-result tests pass; uncertain external effects are retained; context preserves complete tool-call/result groups. |
| 6. Workspace and action safety | Select project root, instruction precedence, ignored paths, canonical path/reparse-point checks, effect-bound approval, privacy/egress rules and Windows isolation qualification. | Out-of-project and stale/changed approvals are denied; cancellation stops permitted work and late writes; executable handlers stay disabled unless isolation qualifies. |
| 7. Agent loop and initial tools | Compose model → validated tool request → policy/approval → journal → allowed executor → bounded result → model. Start with narrowly scoped read/list/search tools; add writes/shell only after stage 6. | One real project task completes with evidence; rejected approval causes no effect; retries cannot silently duplicate writes; iteration/time/spend limits stop work. |
| 8. Attachments and artifacts | Quarantine, limits/type checks, extraction, safe preview, artifact manifests/hashes, local storage, download and conversation/run association. | Unvalidated input never reaches parsers/tools; previews cannot execute arbitrary content; generated files survive restart and resolve to the producing run. |
| 9. Memory and skills | Personal/project/private memory, edit/delete/provenance, retrieval, embedding configuration; selective skill loading and trust/revocation. | Retrieval respects project scope; edited/deleted facts stop resurfacing; skill text cannot grant permissions; scripts use the same governed tool path. |
| 10. MCP and selected connections | Implement one MCP integration and one useful external connector, secret references, tool discovery, authentication, reconnect/cancel and normalized failures. Broaden provider adapters as needed. | Remote tools use the same policy/journal/budget path; disconnect/revocation prevents new execution; no credential leakage. |
| 11. Planning and verification | Goal criteria, plans/tasks/dependencies, evidence-based verification and bounded replanning. | A failed check cannot become completed; dependency failures and human clarifications have durable states. |
| 12. Subagents and schedules | Reduced project/tool scope, isolated context, shared parent budget, bounded fanout; durable scheduled jobs, time zones, sleep/wake, missed-run and overlap policies. | Parent cancellation reaches children; restart loses no accepted work; scheduled execution deduplicates; no automatic capability escalation. |
| 13. Windows product release | Finish management wiring, onboarding, diagnostics, backup/restore, ACLs, signed installer/update path, schema-compatible rollback, retention and live E2E qualification. | Clean Windows install → provider setup → real task → artifact → restart/recovery → restore passes; demo and live evidence remain separate. |

Security, usage, logging, tests and minimal UI wiring apply throughout these stages. Stage 13 is release integration, not the first time those concerns are implemented. Installer/update feasibility should be checked in stage 1, before accumulating platform-specific assumptions.

## Review of every supplied step

| Original step | Assessment and adjustment |
|---|---|
| 1. Local app foundation | Keep first; include application-data location, API bootstrap, configuration validation and Windows secret-store choice. |
| 2. Database | Keep early; choose an explicit store plan, migration strategy and transcript owner. Do not rebuild all future tables before proving a thin real workflow. |
| 3. Gateway | Keep early; compose current adapters with real persistence rather than add another API implementation. |
| 4. Conversation system | Keep early; build persistence before real response streaming, then integrate the first provider. |
| 5. Model providers | Correct to move early; start with one. Add others after the adapter contract is proven. |
| 6. Model registry | Build minimally with the first provider. Persist capabilities/defaults; distinguish unavailable features and unknown pricing from supported/free. |
| 7. Agent loop | Move after a minimal durable run engine, context builder, scoped tools and safety boundary. Memory/skills are optional inputs initially. |
| 8. Run engine | Move before the real loop. It owns replay, cancellation, retry limits and recovery from the beginning. |
| 9. Tool registry | Define schemas with the loop contract; execute tools only through approved policy, journal and isolation boundaries. |
| 10. Action approvals | Move before effects. Read operations also need path/privacy checks. Approvals bind exact arguments and do not replace isolation. Model spend can use an explicitly configured budget instead of a prompt for every call. |
| 11. Workspace | Move before local file access and context gathering. Define trusted instructions versus untrusted repository/file/tool content. |
| 12. Context | Move basic assembly/token budgeting before the first loop. Add advanced compression and semantic retrieval incrementally. |
| 13. Memory | Keep after a functioning loop. Replace role-based memory scopes with project/personal/private semantics. |
| 14. Skills | Keep later; do not execute installation/discovery text or let instructions increase authority. |
| 15. MCP | Keep after registry/policy. MCP tools need the same effect and cancellation controls as native tools. |
| 16. Connections | Keep later; implement only useful connectors initially and handle token expiry/revocation. |
| 17. Files/artifacts | Move basic artifacts earlier, alongside first tool workflow. Delay rich formats instead of delaying all output persistence. |
| 18. Planning/tasks | Keep after single-agent execution; include verification/evidence and explicit success criteria. |
| 19. Subagents | Keep late. Scope reduction, shared budgets and cancellation must already work. |
| 20. Background jobs | Split: durable dispatch/recovery early; optional independent workers and extra job types later. An in-memory queue alone loses accepted work. |
| 21. Schedules | Keep after durable execution; include Windows sleep/wake and missed/overlapping runs. |
| 22. Usage | Move minimal measurement and budget admission to first provider call; add reporting later. |
| 23. Activity/logs | Start redacted correlation/event records at the foundation; add the richer Activity view later. |
| 24. Frontend | Reuse existing UI and wire each milestone. Keep seven primary sections with tabs/details for additional capabilities. |
| 25. Local security | Spread through stages 1–10; release hardening is later. Command filtering and shell confirmation alone are insufficient. |
| 26. Packaging | Windows only for this release. Check installer/runtime/data-directory constraints early; deliver installer, safe updates, diagnostics and restore at the end. |

## First two useful milestones

**A — Persistent real chat:** clean setup, local contracts/schema, one live Gateway, existing Chat, one real provider, bounded context, run status, cancellation, usage and restart-safe messages. No tools or long-term memory are required to prove this milestone.

**B — Governed project task:** select a folder, read approved files, produce a report artifact, show a correctly bound approval for a proposed write, perform only qualified effects, verify the output and recover an interrupted run without duplicating the write. Executable tools wait for the Windows isolation gate.

Do not begin by adding many providers, 14 new screens, autonomous self-improvement, agent competition, swarms, knowledge graphs, cloud deployment or cross-platform installers. They are later choices, not prerequisites for a useful personal agent.

## Verification performed for this review

- Current folder/source inspection, Markdown cross-checks, reference attachments and three task-ledger inventories.
- `node scripts/verify-traceability.mjs .`: PASS, zero violations.
- `node scripts/verify-dependencies.mjs .`: PASS, 32 manifests, zero violations. This validates inventory rules, not installed dependencies or runtime compatibility.
- `node scripts/verify-v2-guide.mjs .`: PASS, 30 archived sources, 104 dependency nodes, zero violations. The initial sandbox run could not launch `rg`; the read-only rerun outside the sandbox passed.
- `node scripts/v2-task.mjs next`: WAITING for V2-T02 boundary approval. This is the old plan's navigator result, not a blocker to this requested review and not an endorsement of that next task for the revised local scope.
- `node scripts/verify-architecture.mjs .`: could not run because the checkout has no installed TypeScript package. No architecture-pass claim is made.
- No dependency install, full typecheck/build/test run, database migration, live provider call or sandbox qualification was performed. Historical receipts are reported as historical evidence only.

The supplied list is strong enough to define the intended product. With the reordered prerequisites, explicit local migration decisions and measurable gates above, it can become a strong implementation plan. It should not be executed unchanged against this repository.
