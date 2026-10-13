> **V2 consolidation (2026-10-07):** Read [the unified V2 build guide](../../v2-build-guide.md) for the combined target, completed-task migrations and extension task cards. This file remains a source record; its historical status prose is not current completion evidence. New V2 boundaries await recorded review.

# ASI TypeScript Agent System — Architecture Analysis and Proposed Specification

Date: 2026-10-06 (user timezone: Asia/Calcutta)
Status: PROPOSED; prepared for review. This is a planning artifact, not a claim of implemented capability.
Companion plan: `../plans/2026-10-06-asi-agent-build.md`
Machine-readable baseline: `../../architecture-baseline.json`

## 1. Intent and success criteria

The user requested workspace analysis first, image analysis second, and an end-to-end build plan detailed enough for future agents to follow without changing the original architecture. No product implementation, dependency installation, deployment, or external messaging was requested.

Success means: every pictured component has an owner, typed boundary, implementation task, dependency order, verification gate, and failure behavior. The plan must retain governance outside the agent, deterministic orchestration, isolated tools, episodic and hierarchical memory, offline consolidation, and protocol interoperability. Changes to the architecture must be visible and reviewed.

Working assumptions pending review: one tenant on one Linux host initially; Windows is the development workstation; web Chat is now the prioritized Client Surface following the user's frontend planning request, with CLI/Slack as additional adapters; one specialist initially; BullMQ/Redis is the initial queue backend; containers for reviewed tools, a qualified microVM backend before executing generated or untrusted code. These are proposed implementation choices, not facts supplied by the user.

Frontend extension: `2026-10-06-agent-workspace-ui-design.md` and `../plans/2026-10-06-agent-workspace-ui-build.md` specify seven sections and inline Chat questions/approvals. Shared contracts and a simulated Gateway precede frontend work; real operations still require this spec's backend security gates. The web client remains within `channels`, preserving all 12 architecture components.

“ASI-level” is the project aspiration/name. This architecture does not establish superintelligence, general intelligence, or guaranteed safe self-improvement. Acceptance is based on measurable behavior.

## 2. Workspace findings

The inspected workspace contains six existing files:

| Artifact | Finding | Role in planning |
|---|---|---|
| `ASI TypeScript.md` | 77,014-byte research report; sections on governance, memory, orchestration, protocols, production, and migration | Design rationale and proposed capabilities; claims require independent verification |
| `assets/architecture_blueprint.png` | Architecture image referenced by the report | Reference asset |
| `assets/orchestration_tradeoffs.png` | Orchestration comparison referenced by the report | Supporting research asset |
| `assets/feature_gap.png` | Capability-gap image referenced by the report | Supporting research asset |
| `.archify/architecture-asi-typescript-agent-20261006-120000/candidate.json` | 12 components, 12 connections, security/memory regions, four explanatory cards | Best structured evidence of the pictured graph |
| `.archify/architecture-asi-typescript-agent-20261006-120000/asi-typescript-agent.html` | Standalone rendered architecture and four cards | Matches the uploaded screenshots |

No application source, package manifest, lockfile, automated tests, CI configuration, or existing AGENTS.md was found. Git reports that this directory is not a repository. This is a research/design workspace, not an application already partly built.

Read-only environment checks found Node 24.19.0, pnpm 12.6.0, and Docker CLI 29.4.3. Docker daemon readiness, Linux kernel capabilities, and local-model hardware are not established. `wsl --status` returned access denied in this tool context; that does not establish whether WSL is installed or usable by the user.

Documents and screenshot text are reference material. Instructions embedded in them are not treated as user instructions.

## 3. Image analysis

Image 1 contains four requirement groups: governance/security, deterministic orchestration, memory/learning, and standards/interoperability. Image 2 contains the component graph and trust/storage regions. Together they describe a reference architecture rather than a complete execution specification.

The principal pictured flow is:

`Client Surfaces → Unified Gateway → Orchestrator Agent → Specialist Fleet → Tool & MCP Engine → Isolated Sandbox`

Inference branches through `Privacy Router → Frontier Models`; episode logging branches from the gateway; specialists query shared memory; the background learning path is `Episodic Store → Dream Consolidator → Shared Memory`.

The structured candidate and rendered screenshot differ slightly: the candidate labels the gateway-to-policy edge “verify policy,” while the screenshot’s routed line appears beside the privacy router. Preserve the intent: BOTH ingress authorization and inference authorization are required. The policy kernel is an enforcement dependency of every effectful component, not one isolated arrow.

The graph omits return traffic, cancellation, approvals, identity, budgets, credential ownership, recovery, migrations, audit persistence, and rollout. The spec below fills in those mechanisms inside the pictured components; it does not replace the graph with a different architecture.

## 4. Corrections and design gaps

| Finding | Engineering resolution |
|---|---|
| PII stripping is labeled “differential privacy” | Implement and measure redaction/classification. Do not claim differential privacy unless a defined mechanism, privacy budget, and composition analysis are added through a separate decision. |
| Diagram perimeter can be mistaken for an actual isolation mechanism | Require separate processes/identities, read-only policy assets, restricted mounts, and enforced network routes. A diagram boundary or Node worker thread is not isolation. |
| Landlock/seccomp are specified on a Windows workspace | Build/test enforcement in a qualified Linux runtime. Probe support; fail closed for executable tools when required controls are unavailable. |
| “Deterministic loop” can imply deterministic model answers | Deterministic means code owns transitions, routing tie-breaks, budgets, retries, and replay decisions. Persist nondeterministic model/tool results. |
| “50%/85% compression” is placed on the store | The context manager owns thresholds. SQLite stores raw episodes and compression lineage; compression never rewrites original episodes. |
| Prefix preservation can imply guaranteed cache hits | Preserve the stable prefix bytes and record provider-specific cache behavior. Cache hits remain provider-dependent. |
| SQLite and PostgreSQL have unclear ownership | SQLite owns raw episodes/FTS/lineage through one service. PostgreSQL owns control state, leases, durable work/outboxes, receipts, and curated shared memory. Cross-store work is idempotent and reconciled. |
| RLS can be bypassed by an owner/superuser or forged session settings | Keep DB credentials in trusted brokers, derive scope from authenticated service identity, use a non-owner/no-BYPASSRLS runtime role, FORCE RLS, and test with that actual role. |
| BullMQ/JetStream is an unresolved choice | Start with BullMQ/Redis behind a QueuePort. JetStream requires an approved migration decision and the same contract tests. Do not operate both by default. |
| Queue retry can repeat external effects | Use a durable effect journal and provider idempotency keys. Unknown non-idempotent outcomes enter reconciliation; never blindly retry. |
| “Self-registering tools” can mean importing arbitrary modules | Discover signed declarative manifests. Verify before registration; load executable handlers only inside qualified isolation. Availability checks must fail closed. |
| MCP and A2A are grouped together | Keep distinct adapters: MCP for tools/resources; A2A for remote tasks/cards. Remote A2A agents have their own trust boundaries; local sandboxing does not constrain them. |
| Report says MCP 2025-11-25 is current | Official latest specification currently resolves to 2026-07-28. Pin and test a supported revision; legacy support must be explicit. |
| Signed skills “prevent” supply-chain attacks | Signatures establish provenance/integrity, not harmlessness. Pair signing with least privilege, isolation, tests, revocation, and review. |
| Dream consolidation/evolution are presented like ordinary CRUD | Treat these as experimental capabilities with provenance, independent budgets, shadow mode, eval gates, reversible publication, and explicit promotion. |
| Report suggests governance appears late in fleet rollout | Move policy, identity, budgets, receipts, and minimal isolation before the first real tool. Delayed capability is acceptable; ungated capability is not. |
| 20+ surfaces and model-provider counts are marketing breadth | Prioritize the requested web Chat surface, then qualified CLI/Slack/WhatsApp/Discord adapters. Define and approve the remaining adapter inventory before claiming 20+ support. |

## 5. Options and recommendation

1. **Recommended: one TypeScript monorepo on one Linux host, with explicit service boundaries.** Keep the pictured flow; deploy only the necessary instances. Policy, inference credentials, memory access, episodic file ownership, and tool isolation remain outside untrusted execution. Lowest operational burden while preserving security boundaries.
2. **Distributed services from day one.** Preserves the graph but introduces partition handling, certificates, placement, and storage coordination before a working assistant exists. Appropriate only if initial multi-tenant availability requirements justify it.
3. **Single in-process prototype.** Fast to demonstrate but cannot satisfy the out-of-process enforcement requirement for executable tools. Suitable only for a clearly labeled throwaway experiment with fake tools; not the target build.

Select option 1 as the proposed baseline. Stage component capacity, not component responsibility: a fleet can begin with one specialist, and a gateway can begin with one surface, without deleting their contracts.

## 6. Component ownership

| Diagram ID / component | Proposed app/package | Responsibility and allowed access |
|---|---|---|
| `channels` / Client Surfaces | `apps/web`, `apps/cli`, `packages/channels` | Normalize messages and deliver results through gateway; no direct model/tool/memory calls; web UI extension owns seven sections and Chat interaction cards |
| `gateway` / Unified Gateway | `apps/gateway`, `packages/gateway` | Authenticate input, bind principal/session, deduplicate events, persist ingress, schedule heartbeats, return delivery status |
| `supervisor` / Orchestrator Agent | `apps/orchestrator`, `packages/orchestrator` | Claim session, assemble context, run Mastra adapter, apply deterministic transitions and budgets, delegate work, compose final reply |
| `specialists` / Specialist Fleet | `apps/specialist`, `packages/specialists` | Accept bounded tasks, authenticate reduced scope, use privacy/model and tool ports, return structured results |
| `toolRuntime` / Tool & MCP Engine | `apps/tool-engine`, `packages/tools`, `packages/protocols` | Verify manifests; authorize, journal, execute, normalize outputs; MCP and A2A adapters remain separate |
| `govKernel` / Policy Kernel | `apps/policy-kernel`, `packages/policy` | Validate modes/effects/approvals, issue short-lived bound capabilities, sign receipts; no agent-write access to policy or signing keys |
| `privRouter` / Privacy Router | `apps/privacy-router`, `packages/privacy` | Classify/redact outbound prompts, route local/cloud, keep provider credentials, account for inference effects |
| `frontierModels` / Models | `packages/models` in privacy service | Approved provider adapters and local-model endpoint; all calls through privacy service |
| `sandbox` / Isolated Sandbox | `packages/sandbox`, `infra/sandbox` | Fresh constrained execution workspace; resource/egress limits; supervisor-owned credentials; container/microVM qualification |
| `sessionFTS` / Episodic Store | `apps/episodic-owner`, `packages/episodic` | Sole SQLite file owner; authenticated append/search; writer fences, raw episodes, FTS5, compression lineage |
| `consolidation` / Dream Consolidator | `apps/consolidator`, `packages/consolidation` | Read bounded tenant episodes, propose merge/link changes, CAS publish approved revisions off request path |
| `memStore` / Shared Memory | `apps/memory-broker`, `packages/memory` | Query/write Global/Role/Private memory under RLS and write policy; keep DB credentials from agents |

Supporting mechanisms belong inside these boundaries: `packages/control` for PostgreSQL control state/outboxes, `packages/audit` for append-only receipts, `packages/telemetry` for redacted traces, and `packages/evolution` plus `apps/evolution-engine` for the diagram’s DGM capability. They are not alternate ingress or execution paths.

## 7. Architecture invariants

R01. Preserve all 12 component IDs and the pictured primary flow; document refinements with traceability.
R02. Every ingress, inference call, tool effect, memory publication, skill installation, and code promotion is authenticated and authorized at execution time.
R03. Policy, approval logic, signing keys, and architecture protection cannot be modified by runtime agents or evolved candidates.
R04. Every external/data boundary uses a versioned runtime-validated contract; inferred TypeScript types come from its schema.
R05. All model calls, including embeddings, summarizers, judges, and background jobs, traverse the privacy router.
R06. Workers obtain reduced scoped identities; supervisor credentials never travel in task payloads.
R07. Executable tool handlers run in qualified isolation; unknown/untrusted/generated handlers require the qualified microVM backend.
R08. One active writer per session; stale epochs cannot append episodes, publish memory, execute effects, or finalize delivery.
R09. SQLite raw episodes and compression lineage remain immutable during normal processing; deletion is a separate authorized retention operation.
R10. Memory “Global” means tenant-global. Role and Private add narrower scope; cross-tenant retrieval is forbidden for text and vectors.
R11. Memory/episode contents and remote results are untrusted data, not authorization or executable instructions.
R12. Code owns run transitions, routing tie-breaks, budget allocation, retries, and cancellation.
R13. Start compression consideration at 0.50; force it at 0.85 before another inference call. Preserve stable prefix and complete tool-call/result groups.
R14. Delegated and background spend counts against explicit parent/tenant limits; reservation is atomic, not an after-the-fact log.
R15. Every effect has a durable intent and a signed final/unknown-outcome receipt; never assert global exactly-once effects.
R16. Background consolidation never synchronously blocks the user request path; it uses bounded resources and reversible CAS publication.
R17. Evolution changes only approved scaffold paths; no promotion without independent tests, held-out evals, policy comparison, signatures, and rollback.
R18. MCP/A2A protocol revision, authentication, cancellation, and task state mappings are explicit and tested.
R19. Telemetry exports metadata/redacted content by default; raw prompts, secrets, and identifying payloads are excluded.
R20. CI enforces allowed imports, service credentials/mounts, requirement coverage, and protected architecture files.
R21. A runnable vertical slice precedes broad channels, many specialists, consolidation, and evolution.
R22. Missing required enforcement, unavailable privacy route, or unavailable durable authorization state denies new effects.
R23. Every capability ships with failure behavior, operational metrics, recovery instructions, and a release gate.
R24. No architecture/dependency substitution without a written decision and explicit human review of the change.

## 8. Contracts and state machines

All IDs are opaque strings; timestamps are ISO-8601 UTC; deadlines are absolute UTC. Every envelope has `schemaVersion: 1`, tenantId, traceId, and correlation/causation IDs. Clients cannot supply an authoritative tenant/role by writing it into a message. The gateway binds a trusted principal from adapter authentication; internal services verify audience-bound credentials.

Core contract inventory (defined in Task 02 of the plan):

| Contract | Required content |
|---|---|
| `Principal` | tenantId, subjectId, agentId if applicable, roles, capabilities, audience, expiresAt; authenticated source |
| `SessionEvent` | eventId, sessionId, platform, externalMessageId, principal reference, receivedAt, content/attachment references |
| `RunContext` | runId, sessionId, writerEpoch, mode, deadlineAt, shared BudgetRef, parentRunId when delegated |
| `TaskEnvelope` | taskId, run context, required capabilities, bounded input, reduced principal grant, idempotencyKey |
| `TaskResult` | taskId, status, schema-validated output or NormalizedError, usage, evidence/artifact references |
| `EffectRequest` | effectId, exact action/resource, inputHash, artifactHash when applicable, run context, idempotencyKey |
| `PolicyDecision` | allow/deny/approval-required; decisionId, policyVersion, bound capability/expiry or reason |
| `ApprovalRecord` | approver identity, effect/input hash, policyVersion, expiresAt, single-use nonce |
| `ModelRequest` | prompt parts and stable prefix, model class, sensitivity, maxOutputTokens, run context, budget reservation |
| `ToolManifest` | toolId/version, input/output schemas, artifact digest, publisher signature, required capabilities, execution class |
| `ToolResult` | discriminated success/error/unknown; bounded content, artifact references, receiptId, usage |
| `MemoryRecord` | memoryId, tenantId, scope, roleId/ownerAgentId as required, version, value, confidence, source episode IDs, authority, sensitivity |
| `CompressionRecord` | compressionId, sessionId, parent generation, source range/digests, prefixHash, summaryHash, model/policy versions |
| `AuditReceipt` | receiptId, tenantId, session/run/effect IDs, monotonic sequence, previousHash, input/output hashes, status, mode, policyVersion, timestamp, keyId, signature |
| `DeliveryRecord` | deliveryId, session/run IDs, channel/destination identity, contentHash, pending/sent/failed/unknown status, remote receipt reference |

Supporting contract fields must be fixed in Task 02 rather than independently invented by consumers:

- `BudgetRef`: tenantId, accountId, rootRunId; child runs retain this root account. `BudgetReservation`: reservationId, budgetRef, reservedTokens, reservedCostMicroUsd, status (reserved/settled/unknown).
- `WriterLease`: sessionId, runId, writerEpoch, expiresAt. `Checkpoint`: checkpointId, runContext, state, completed task/effect IDs, recorded model-result references, version.
- `EpisodeCommand`: commandId, principal grant reference, runContext (or authenticated ingress projection authority before a run exists), episodeId, kind, content/artifact references, source event ID. `AppendReceipt`: episodeId, commandId, sequence, contentHash. `Episode`: tenantId/sessionId/episodeId, sequence, kind, content/artifact references, source IDs, createdAt.
- `MemoryQuery`: query text or embedding reference, requested scopes, limit (1–100), runContext. `MemoryWrite`: record, runContext, EffectRequest reference, source episode IDs. Broker verifies epoch and policy immediately before its transaction commits; an ingress or background principal has a separately defined bounded job context and cannot impersonate a session writer.
- `WorkerDescriptor`: workerId, capabilities, health (healthy/degraded/unavailable), capacity (active/max), supported task types. `NormalizedError`: code, safeMessage, retryable, details reference; no stack/secret payload in model-facing output.
- `ModelResult`: resultId, structured output/text references, usageTokens, costMicroUsd, provider/model revision, finishReason. `SkillManifest`: skillId/version, publisherId/signature, artifactHash, requiredCapabilities, applicable task types, script ToolManifest references, trust status.
- `ConsolidationPlan`: planId, tenantId, source episode IDs, source scopes, expected memory versions, proposed revisions/links, provenance, sensitivity, status. `Candidate`: candidateId, parentCandidateId, artifactHash, allowed changed paths, schema/policy digests, requested permissions, status. `EvalReport`: candidateId, evaluator version, case-set digests, scores, cost/latency, governance failures, signed evidence refs. `PromotionDecision`: candidate/artifact/report hashes, policyVersion, approver identities, expiresAt, decision. `Observation`: tenant/scope/owner, entity/relation/value, observedAt/validUntil, source IDs, confidence, revision.
- `TraceHandle`: opaque local span handle; it never crosses a queue as an executable object. Only validated trace/correlation IDs cross boundaries.

Run states: `accepted → queued → running → waiting_approval | suspended | finalizing → completed`; cancellation/failure/budget exhaustion are explicit terminal states. `waiting_approval → queued` requires the matching unexpired approval; suspension resume validates the current principal and writer epoch. Terminal runs do not resume. Task attempts do not reuse a revoked credential.

Effect states: `planned → authorized → executing → succeeded | failed | unknown`. Known retryable failures may retry within budget; unknown non-idempotent effects await reconciliation. An approval is bound to exact arguments, not a reusable “allow tools” flag.

Initial modes: `observe ⊆ assist ⊆ execute`; define these as capability sets. Privilege reduction always allowed; increases require current policy decision and applicable approval. Model intelligence/cost is a separate axis from authority.

Default bounded v1 settings, reviewed as product choices: 12 model iterations/run, delegation depth 2, 8 delegated tasks/run, 3 tool attempts for known retryable failures, 120-second interactive run deadline, 30-second default tool deadline, 1 MiB inbound JSON limit, 64 KiB inline tool-result limit, 30-second writer lease renewed every 10 seconds. Monetary quotas are required deployment configuration in integer micro-USD; startup refuses missing limits. Long jobs require an explicit durable background task/deadline, not removal of the interactive cap.

## 9. End-to-end flow

1. Adapter verifies platform authentication/webhook signature and normalizes a message. Gateway rate-limits, validates size/type, derives tenant identity, and obtains ingress authorization.
2. Gateway transaction inserts deduplicated PostgreSQL ingress and an episode-projection outbox event. Return a durable accepted ID; do not promise completion.
3. Episodic owner appends the raw event to local SQLite and acknowledges projection. Work dispatch waits for the required initial episode; storage failure leaves the event pending/recoverable.
4. Orchestrator claims the PostgreSQL session lease and monotonically increasing writer epoch. It reconstructs checkpoint/episode state and atomically reserves parent budget.
5. Context builder retrieves authorized memory through memory broker, selects verified relevant skills, and assembles stable prefix plus bounded suffix. It applies compression before an over-threshold call.
6. Inference request goes to privacy router. Router verifies policy, sensitivity, destination, and budget; redacts as appropriate; chooses approved local/cloud provider. Sensitive local-only input never silently falls back to cloud.
7. Model output is validated. Code either composes a reply or creates a bounded task. Deterministic capability ranking dispatches the task via durable outbox/BullMQ to one specialist initially.
8. Specialist re-authenticates with its reduced grant. Tool engine validates the manifest and input, checks current policy/epoch/budget, records effect intent, and either executes inside isolation, calls an approved MCP endpoint, or starts an approved A2A task.
9. Result returns as validated ToolResult → TaskResult → orchestrator observation. Error wrapping exists both at handler and dispatch boundaries; cancellation kills isolated processes and prevents late commits.
10. Owner appends observations, checkpoint and lineage references are advanced, and signed receipts record effects. Repeated logical commands deduplicate at each boundary.
11. Orchestrator finalizes a validated reply. Gateway delivery outbox sends it through the adapter, records the remote receipt, and suppresses duplicate/no-op delivery. Ambiguous sends use reconciliation.
12. Between requests, bounded heartbeat jobs re-enter through the gateway; consolidation reads episodes offline and proposes scoped memory revisions. Generated tools/evolution candidates remain unpublished until their later gates pass.

Return edges omitted in the image are therefore explicit: sandbox/MCP/A2A result → tool engine → specialist → orchestrator → gateway → client. Progress streams are projections of durable run state and resume from an acknowledged cursor.

## 10. Storage, fencing, and audit details

PostgreSQL tables: `ingress_events`, `sessions`, `runs`, `tasks`, `checkpoints`, `outbox`, `effect_journal`, `budget_accounts`, `budget_reservations`, `approvals`, `audit_receipts`, `delivery_outbox`, `memory_records`, `memory_sources`, `memory_revisions`, `skill_versions`, `evolution_candidates`, `eval_results`. Tenant-qualified uniqueness applies to external IDs and idempotency keys. Only designated trusted services have write privileges on their tables.

SQLite tables: `episodes`, `episode_fts`, `compression_records`, `command_dedup`. Local Linux volume only; WAL, busy timeout, explicit checkpoint monitoring, `synchronous=FULL` for acknowledged writes. Select a bundled SQLite build with required bug fixes during qualification. Only episodic-owner opens the file; other services use its authenticated API.

Fenced append procedure: episodic-owner acquires the PostgreSQL session row lock, checks principal/run/epoch/lease using server time, commits an idempotent SQLite command, then advances PostgreSQL projection metadata and commits the PostgreSQL transaction. No model or remote tool runs while that lock is held. Crash after the SQLite commit is repaired by command ID dedup and projection reconciliation. This is not an atomic transaction across both databases. Integration tests must cover both commit boundaries and lease takeover.

Shared memory queries run in a trusted broker transaction. Broker derives tenant/role/agent settings from verified identity, never request-provided SQL/session variables. FORCE RLS, explicit USING/WITH CHECK policies, no runtime owner/superuser/BYPASSRLS role, tenant-filtered vector retrieval, CAS version updates, sensitivity checks before wider-scope publication. Global never crosses tenants. Consolidation cannot widen a source’s audience or erase contradictions silently.

Audit signing occurs outside agent-writable storage. Receipt sequence/hash-chain updates are serialized per tenant; an independent append-only export/checkpoint detects tail truncation. Hash chains alone cannot prove a privileged administrator has not removed the tail. Unknown effects remain visible even if the result receipt cannot be written; deny new effects while durable audit/authorization is unavailable. Signing-key rotation keeps key IDs and verification history.

Backups cover PostgreSQL, a SQLite backup API snapshot/WAL-consistent export, manifests, and policy/key metadata. Do not copy only an active SQLite .db file. Demonstrate restore on a clean host before release. Retention deletion removes scoped source/projection content under an explicit policy and records a minimal receipt without retaining the erased sensitive payload.

## 11. Dependency and platform baseline

- Node.js 24 LTS; installed 24.19.0 is observed, not an automatic production approval. Resolve/pin one qualified 24.x patch during Task 01.
- TypeScript 5.9.x strict; `strictNullChecks`, `strictFunctionTypes`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; pure ESM, ES2022+, Node-compatible module resolution; type-check independently of runtime type stripping.
- Zod exactly 4.6.5 proposed and independently confirmed as a published release. Test optional/unknown semantics explicitly; imports use `zod`/documented `zod/mini`, not an assumed standalone `@zod/mini` package.
- Mastra core 1.x behind an adapter; Hono gateway; Vercel AI SDK/provider adapters inside privacy service; approved exact compatible patches recorded before scaffolding.
- PostgreSQL 17 supported patch + pgvector; SQLite FTS5/WAL behind owner service; BullMQ/Redis initial backend. No alternate database or queue without a reviewed decision.
- MCP target revision 2026-07-28 after SDK qualification; A2A target 1.0.0. If SDK does not implement required behavior, stop that integration at the compatibility gate and present a concrete supported-version decision.
- OpenTelemetry through one internal facade to Langfuse. Collector/exporter failure does not lose durable audit records.
- Linux enforcement runtime; Windows may run editing/type/unit work, but sandbox/security integration and release checks run on Linux. Containers and microVMs have separate qualifications.
- pnpm workspaces proposed; qualify/pin a package-manager version rather than silently assume the installed version is compatible.

The dependency inventory gate records exact versions, artifact/image digests, license, provenance, peer compatibility, bundled SQLite version, and support windows. “Latest-pinned” is not a usable version specification. No installs were performed for this planning task.

## 12. Build stages and release gates

| Stage | Result | Must pass before moving on |
|---|---|---|
| A: foundation | Approved baseline, runnable workspace, contracts, trusted stores, identity, policy, audit | Import/contract/identity tests; no real effects enabled |
| B: protected vertical slice | Web Chat → gateway → Mastra → one specialist → reviewed sandboxed tool → persisted result → Chat; CLI uses the same contracts when enabled | No bypass, privacy/budgets, RLS/fencing, timeout and replay tests |
| C: useful assistant | Context compression, curated memory, signed skills, Slack, heartbeat | Recall/cache-prefix tests, install revocation, duplicate delivery tests |
| D: interoperable service | MCP, A2A, bounded fleet, WhatsApp/Discord, operational deployment | Protocol/auth tests, crash/load/backup restore, release evidence |
| E: background learning | Offline consolidation, shadow tool synthesis, optional observation graph | Scope preservation, CAS conflicts, held-out recall evals, rollback |
| F: gated evolution | Scaffold candidate archive, isolated benchmark, staged promotion | Protected-path denial, independent held-out evals, canary rollback |

Do not infer timelines from the report’s 0–12 month roadmap. Estimate after the vertical slice establishes implementation velocity, hardware cost, and operational scope. No date promise is justified by the current evidence.

## 13. Architecture drift prevention

Root AGENTS.md points agents to this spec, the plan, and the machine baseline. Each future task names requirement IDs, files, consumed/produced interfaces, test commands, and exit evidence. The build adds CI import rules, API/schema compatibility fixtures, credential/mount/network checks, and tests proving prohibited direct paths fail.

Each agent works on an assigned task and file set. Boundary changes require an ADR that states the old behavior, proposed behavior, affected requirements/tasks/contracts, security impact, migration/rollback, and explicit human approval. Protected files include baseline, policy, approval gates, signing code, architecture tests, CI enforcement, and evaluation goldens; modifying a protection to pass a failing test is not permitted.

Prompts/AGENTS.md alone cannot guarantee zero drift. Enforcement comes from review and protected CI/release checks outside the runtime agent’s write permissions. Initial docs describe the rules; enforcement is built in Tasks 01, 03, 07, 13, and 30.

## 14. Decisions requiring review before their affected work

| Decision | Working assumption | Blocking point |
|---|---|---|
| First users/product tasks | Developer/research assistant with web Chat and approved read tools | Before defining real-world eval corpus in Task 01 |
| Deployment | Single-tenant Linux host, Windows development | Before sandbox qualification/production rollout |
| First messaging channel | Slack after the protected Gateway/web Chat slice | Before channel implementation |
| Model/data policy | Cloud for approved nonsensitive data; local-only route or denial for sensitive data | Before credentials/real data are used |
| Spend and retention | Required explicit tenant quotas and retention settings | Before first real inference and release |
| MicroVM backend/hardware | Qualified backend selected by isolation contract suite | Before generated/untrusted execution |
| Additional 20+ surfaces | Extension capability; initial named targets CLI/Slack/WhatsApp/Discord | Before advertising breadth or expanding adapter inventory |
| Autonomous promotion | Human review initially; narrower policy automation only after independent evidence | Before any promotion automation |

The plan can be reviewed now. These decisions are not permission requests for already-authorized analysis/planning; they constrain later implementation/deployment.

## 15. Independently checked sources

These sources were checked on 2026-10-06. Verification was targeted to load-bearing technical claims; it was not a full audit of every statistic/claim in the research report.

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases): release/support baseline; patch qualification remains a build task.
- [TypeScript 5.9 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html): published language baseline.
- [Zod releases](https://github.com/colinhacks/zod/releases) and [Zod migration guide](https://zod.dev/v4/changelog): 4.6.5 exists; unknown/any optionality requires explicit tests.
- [MCP latest specification](https://modelcontextprotocol.io/specification/latest) and [2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http): current revision and transport/security behavior; avoid implementing old session assumptions without explicit compatibility handling.
- [A2A 1.0 specification](https://a2a-protocol.org/v1.0.0/specification/): agent/task interoperability; authorization remains an application responsibility.
- [PostgreSQL 17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html): owners/superusers/BYPASSRLS matter; FORCE RLS and actual role tests are required.
- [SQLite WAL](https://www.sqlite.org/wal.html): local-host limitation, WAL/checkpoint behavior; no network-shared SQLite files.
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs) and [stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs): retries/recovery require idempotent application behavior.
- [Mastra durable agents](https://mastra.ai/blog/what-are-durable-ai-agents): checkpoint/storage support does not remove external-effect reconciliation requirements.
- [OpenShell architecture](https://docs.nvidia.com/openshell/latest/about/architecture) and [Linux Landlock](https://docs.kernel.org/userspace-api/landlock.html): trusted supervisor/enforced boundary pattern and Linux qualification.
- [OTel conventions](https://opentelemetry.io/docs/specs/semconv/): convention evolution motivates a telemetry facade.
- [DGM paper](https://arxiv.org/abs/2505.22954) and [SCM paper](https://arxiv.org/abs/2604.20943): research anchors for experiment design, not a guarantee that this implementation inherits their results.
