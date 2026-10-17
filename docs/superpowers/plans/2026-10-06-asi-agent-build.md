> **V2 consolidation (2026-10-07):** Read [the unified V2 build guide](../../v2-build-guide.md) for the combined target, completed-task migrations and extension task cards. This file remains a source record; its historical status prose is not current completion evidence. New V2 boundaries await recorded review.

> **Current platform scope — 2026-10-15:** Build and deploy the Windows version only. Linux is allowed only as an optional VM guest for qualified isolation; standalone Linux hosts/releases are deferred. This supersedes earlier platform assumptions in this document. PostgreSQL/Redis and ordinary integration/security tests remain in the Windows work queue. Preserve required protections and tests; unsupported executable paths stay disabled. See ADR 0004.

# ASI TypeScript Agent System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Execution method has not been selected; this request authorizes planning only.

**Goal:** Build the pictured TypeScript agent architecture in verifiable increments, with enforced component boundaries and reviewable changes.

**Architecture:** Preserve the 12 pictured components, use Mastra inside a deterministic shell, and keep policy, provider credentials, memory credentials, and executable tools behind distinct trusted boundaries. Start on one Windows host with the requested web Chat surface, one specialist, SQLite episodes, PostgreSQL curated memory/control state, and BullMQ/Redis. Add breadth and experimental learning only after the protected vertical slice passes.

**Tech Stack:** Proposed Node 24 LTS, TypeScript 5.9.x strict ESM, Zod 4.6.5, Mastra 1.x, Hono, AI SDK, PostgreSQL 17/pgvector, SQLite FTS5/WAL, BullMQ/Redis, OpenTelemetry/Langfuse, qualified Windows-hosted isolation (optional Linux VM guest), MCP and A2A.

**Spec:** `docs/superpowers/specs/2026-10-06-asi-agent-design.md` (PROPOSED; read it with this plan).

**Frontend guide:** `docs/superpowers/plans/2026-10-06-agent-workspace-ui-build.md` supplies U01–U22 and the precise seven-section/inline-approval UI design. Start its shared contracts and simulated Gateway after this plan's workspace/contracts tasks 01–02; build the UI while backend work continues. Real UI integration waits for its named backend gates. This extension prioritizes web Chat within Client Surfaces and preserves backend task IDs/architecture. A simulation is not a completed protected slice.

## Global constraints

- Preserve all 12 component IDs and the pictured primary flow; document refinements with traceability.
- Policy, approval logic, signing keys, and architecture protection cannot be modified by runtime agents or evolved candidates.
- All model calls, including embeddings, summarizers, judges, and background jobs, traverse the privacy router.
- Workers obtain reduced scoped identities; supervisor credentials never travel in task payloads.
- Executable tool handlers run in qualified isolation; unknown/untrusted/generated handlers require the qualified microVM backend.
- Memory “Global” means tenant-global. Role and Private add narrower scope; cross-tenant retrieval is forbidden for text and vectors.
- Start compression consideration at 0.50; force it at 0.85 before another inference call. Preserve stable prefix and complete tool-call/result groups.
- Every effect has a durable intent and a signed final/unknown-outcome receipt; never assert global exactly-once effects.
- No architecture/dependency substitution without a written decision and explicit human review of the change.
- Exact dependency versions and image digests are resolved in Task 01 before product scaffolding; failed compatibility qualification blocks dependent work.
- No source is implemented in this planning turn. All tasks below are pending. Proposed assumptions and review decisions are in spec sections 1 and 14.

## Review focus

1. Duplicate or out-of-order events and crashes after a remote effect: preserve durable input and avoid blind duplicate execution. Tasks 04, 13, 16, 19, 25.
2. Stale writer/revoked identity racing takeover: prevent late episode, effect, memory, and reply commits. Tasks 03, 07, 08, 09, 16, 19.
3. Retrieval or consolidation leaking tenant/private data: scope text, vectors, embeddings, summaries, and publication. Tasks 09, 11, 17, 26.
4. Background/child work overspending or exceeding context: share atomic reservations, bound recursion/output, preserve prefix and tool groups. Tasks 06, 14, 15, 17, 21, 26, 29.
5. Malicious skill/tool/remote result or protocol change: verify artifact provenance, enforce the runtime boundary, validate versions, and protect promotion gates. Tasks 12, 13, 18, 22, 23, 27, 29, 30.

## 1. Execution rules

Use the approved spec/baseline as the source of architecture decisions. Read root AGENTS.md before each task. Only start a task when its dependencies and phase gate are satisfied. Assign an implementer explicit task ID, requirement IDs, file set, interfaces, and acceptance tests; do not give an agent “build the platform” as an unbounded instruction.

For each implementation task:

- [ ] Read its consumed interfaces and the relevant spec sections; identify baseline differences before editing.
- [ ] Add the named behavior tests and fixtures; run the task command and observe a meaningful failure. Missing tooling/setup alone is not the behavior failure.
- [ ] Implement the listed boundary and required values; keep unrelated files untouched.
- [ ] Run the task command to pass, then affected integration/architecture checks. Do not substitute a passing unit test for a security integration test.
- [ ] Review requirements, changed files, credential/egress implications, and evidence. Record test counts/output and remaining limitations.
- [ ] Update `docs/task-ledger.json`; commit the reviewed task with a focused message after Git setup exists. A task can have smaller commits; completion requires all acceptance evidence.

Tests below include exact assertions for the important behavior. Fixture names in examples describe test harness results, not new product APIs; each task creates its own fixtures alongside the named test. Public interfaces listed below are the stable product boundary; HTTP/queue adapters validate the same schemas.

No automatic subagent dispatch is authorized by the mere presence of this plan. Choose native or subagent execution with the user before implementation. Where multiple agents are later used, contract tasks complete before their consumers, and overlapping files have one owner. Security/evolution tasks require a reviewer distinct from the implementer.

## 2. Proposed file structure

```text
AGENTS.md
package.json                         # Workspace scripts and exact package-manager version
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json                   # Strict ESM compiler baseline
.node-version
.env.example                         # Names/defaults, never credentials
apps/{gateway,orchestrator,specialist,policy-kernel,privacy-router,
      tool-engine,episodic-owner,memory-broker,consolidator,evolution-engine,cli}/src/main.ts
apps/web/                            # Frontend extension; U01–U22 guide owns its file map
apps/gateway-fixture/                # Explicit development-only simulated UI Gateway
packages/contracts/src/              # Schemas and inferred types, no infrastructure imports
packages/{identity,control,audit,budgets,policy,episodic,memory,
          telemetry,privacy,models,sandbox,tools,specialists,
          orchestrator,gateway,context,skills,channels,protocols,
          consolidation,evolution,observations}/src/
packages/*/package.json              # Explicit exports and permitted dependencies
packages/*/test/                      # Unit/contract tests owned by the package
db/postgres/migrations/              # Control, RLS, audit, memory, learning tables
db/sqlite/migrations/                # Episode/FTS/lineage tables
infra/compose.yaml                   # Windows-hosted private services; owner-exclusive Windows or optional VM-local volume
infra/policies/                      # Versioned declarative policies
infra/sandbox/                       # Qualified container/microVM profiles
scripts/{verify-architecture,verify-dependencies,verify-manifests,
         verify-protected-files,verify-traceability,verify-all}.mjs
tests/{architecture,integration,security,protocols,e2e,load,release}/
evals/{cases,held-out,baselines}/     # Human-reviewed task cases and independent goldens
docs/architecture-baseline.json      # Pictured IDs, permitted paths, requirement coverage
docs/task-ledger.json                # Task dependency/status/evidence tracking
docs/decisions/                      # ADRs with explicit approval status
docs/dependency-inventory.json       # Exact versions/digests/qualification evidence
docs/runbooks/                       # Recovery, deployment, backup, key rotation, incident response
docs/release-evidence/               # Gate outputs, eval comparisons, known limitations
```

App files are composition roots; business logic lives in the owning package. Direct cross-app imports are forbidden. Contracts/ports cross the boundary; application credentials and schema/session adapters do not.

## 3. Commands and evidence convention

Task 01 creates these actual workspace scripts: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:security`, `pnpm test:protocols`, `pnpm test:e2e`, `pnpm test:load`, `pnpm verify:architecture`, `pnpm verify:dependencies`, `pnpm verify:traceability`, and `pnpm verify`.

Use Vitest for named test files: `pnpm exec vitest run <path>`. Unit tests use deterministic fake models. Integration/security/protocol tests use actual PostgreSQL runtime roles and real Windows-hosted isolation where applicable; a Linux guest is allowed only inside an optional VM. Database-only tests do not require Linux or KVM. Test service startup/teardown is owned by a test harness and cannot silently fall back to mocks when integration dependencies are missing. `pnpm verify` executes lint, typecheck, build, unit, architecture, dependency, and traceability checks; full release validation adds integration/security/protocol/e2e/load suites.

Targeted run before implementation: named assertions FAIL. Run after implementation: all named assertions PASS, no skips, exit 0. Security gates fail if infrastructure is absent. Record platform/kernel/backend/version with results. Real model evals are separately budgeted; fake model tests establish control correctness, not model quality.

## 4. Dependency order and milestones

```text
01 → 02 → 03 → 04
04 → 05 → 06 → 07
04 + 07 → 08 → 09
02 + 05 → 10
03 + 05 + 06 + 07 + 10 → 11
03 + 07 → 12
05 + 06 + 07 + 12 → 13
03 + 04 + 06 + 13 → 14
08 + 09 + 10 + 11 + 13 + 14 → 15 → 16  [protected vertical slice]
16 → 17 + 18 + 19 + 20
06 + 16 + 19 → 21
13 + 19 → 22 + 23
14 + 20 + 22 + 23 → 24
17 + 18 + 19 + 21 + 24 → 25            [production release gate]
09 + 11 + 17 + 25 → 26
12 + 13 + 18 + 25 → 27
09 + 26 → 28                          [optional, review-gated]
25 + 26 + 27 → 29 → 30                [evolution/full-system gate]
```

The `+` branches describe logically independent work after prerequisites. They do not authorize parallel agents. For the first pass, execute numerically unless there is an approved task allocation. Task 28 is explicitly optional; skipping it preserves the pictured architecture and must be recorded rather than counted as implemented.

## 5. Stage A — reproducible foundation and trusted control

### Task 01: Approve/freeze the baseline and create a reproducible workspace

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R01, R04, R20, R21, R24. Dependencies: user review of proposed spec/plan and selection of execution method.

Files: create root manifests/compiler/version files; `scripts/verify-{architecture,dependencies,traceability,protected-files}.mjs`; `tests/architecture/imports.test.ts`; `docs/dependency-inventory.json`; `docs/decisions/0001-runtime-and-dependencies.md`. Modify baseline/ledger only to record approved choices.

Interfaces: produces `pnpm verify` and the scripts in section 3; baseline task/component IDs remain stable.

- [ ] Record approved deployment, first real tasks, model/data policy, and release scope. Freeze exact dependency/image versions by registry provenance + peer/API compatibility qualification; retain Zod 4.6.5 unless a reviewed change is necessary. Confirm the selected Windows-hosted isolation backend and any optional VM capabilities before executable tool tasks.
- [ ] Add an architecture fixture where a channel imports provider SDK directly and a dependency manifest uses an unapproved range. Assert `violations` contains `CHANNEL_MODEL_BYPASS` and `UNPINNED_DEPENDENCY`; clean graph asserts `violations.length === 0`.
- [ ] Run `pnpm exec vitest run tests/architecture/imports.test.ts` for RED; then implement strict ESM workspace, package exports, test harness, and verification scripts.
- [ ] Run `pnpm verify`; frozen install must reproduce without lockfile mutation. Check a deliberate forbidden import fails `pnpm verify:architecture`.
- [ ] Initialize Git only as part of implementation, if still absent; add safe ignores for data, secrets, caches, eval outputs. Commit foundation after review. No existing research assets are deleted or rewritten.

### Task 02: Versioned boundary schemas and fixtures

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R04, R12, R18. Dependencies: 01.

Files: `packages/contracts/src/{identity,session,task,effect,model,tool,memory,audit,delivery,index}.ts`; `packages/contracts/test/{schemas,compatibility}.test.ts`; `tests/fixtures/contracts/`.

Interfaces: export schemas and `z.infer` types named exactly as the spec inventory: Principal, SessionEvent, RunContext, TaskEnvelope, TaskResult, EffectRequest, PolicyDecision, ApprovalRecord, ModelRequest, ToolManifest, ToolResult, MemoryRecord, CompressionRecord, AuditReceipt, DeliveryRecord. Also export BudgetRef, BudgetReservation, NormalizedError, ModelResult, Episode, EpisodeCommand, AppendReceipt, WriterLease, Checkpoint, MemoryQuery, MemoryWrite, WorkerDescriptor, SkillManifest, ConsolidationPlan, Candidate, EvalReport, PromotionDecision, Observation with the supporting fields fixed in spec section 8. TraceHandle is a local telemetry type, not a serialized schema or queue object.

- [ ] Add schemas.test.ts assertions: invalid schemaVersion, missing tenant, impossible scope fields, negative micro-USD, expired/invalid deadline format, or success-and-error in one result all reject; optional absent differs from required unknown/any. Example: `expect(MemoryRecordSchema.safeParse(privateWithoutOwner).success).toBe(false)`.
- [ ] Run the schemas test for RED; implement discriminated unions, field bounds, explicit optionality, normalized errors, UTC timestamps, and public schema exports.
- [ ] Run both test files for GREEN plus `pnpm typecheck`. Snapshot only public wire schemas; compatibility fixtures reject accidental breaking renames.
- [ ] Record the error-code inventory: INVALID_INPUT, UNAUTHENTICATED, POLICY_DENIED, APPROVAL_REQUIRED, STALE_WRITER, BUDGET_EXCEEDED, TIMEOUT, CANCELLED, DEPENDENCY_UNAVAILABLE, UNKNOWN_OUTCOME. Commit the contract boundary.

### Task 03: Authenticated identities, reduced capabilities, and secret boundaries

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R03, R06, R20, R22. Dependencies: 02.

Files: `packages/identity/src/{verify,delegate,revoke}.ts`; `packages/identity/test/grants.test.ts`; `tests/security/credentials.test.ts`; native Windows process bootstrap and protected service/file credentials; no container deployment file.

Interfaces: `verifyPrincipal(token: string, audience: string): Promise<Principal>`; `delegatePrincipal(parent: Principal, capabilities: string[], audience: string, expiresAt: string): Promise<string>`; `revokeGrant(grantId: string): Promise<void>`.

- [ ] Add grants tests: requesting a capability absent from parent rejects; wrong audience, expired/revoked grant, and client-forged tenant reject. Assert child capability set is a subset and child payload has no provider/DB credentials.
- [ ] Run grants test for RED; implement short-lived authenticated service grants, revocation lookup, key rotation metadata, and per-service credentials. Do not allow message content to set authenticated tenant/roles.
- [ ] Run grants + credentials tests for GREEN; inspect actual sandbox mounts/env to prove signing/provider/DB secrets are absent.
- [ ] Document bootstrap/rotation in `docs/runbooks/identity.md`. Commit after boundary review.

### Task 04: PostgreSQL control state, leases, durable inbox, and outbox

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R08, R12, R15, R23. Dependencies: 03.

Files: `db/postgres/migrations/001-control.sql`; `packages/control/src/{ingress,leases,outbox,checkpoints,effects}.ts`; `tests/integration/control.test.ts`.

Interfaces: `acceptIngress(event: SessionEvent): Promise<{acceptedId: string; duplicate: boolean}>`; `claimSession(sessionId: string, runId: string): Promise<WriterLease>`; `renewLease(lease: WriterLease): Promise<WriterLease>`; `saveCheckpoint(checkpoint: Checkpoint): Promise<void>`; `publishOutbox(limit: number): Promise<number>`; `recordEffectIntent(request: EffectRequest): Promise<void>`.

- [ ] Assert duplicate platform event produces one accepted event/outbox item; stale epoch CAS fails; 30-second lease takeover increases epoch; transaction failure leaves neither inbox nor orphan dispatch; outbox retry publishes one logical task ID.
- [ ] Run control integration test for RED; implement SQL migrations, tenant-qualified uniqueness, server-time leases, typed checkpoints, durable effect intent, and outbox relay. Redis is transport, not authoritative task history.
- [ ] Run control test for GREEN using real PostgreSQL; inject restart before/after outbox publication and verify convergence. No cross-database atomicity claim.
- [ ] Add migration forward/restore notes; commit the durable control substrate.

### Task 05: Signed audit receipts and independent verification

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R03, R15, R19, R23. Dependencies: 04.

Files: `db/postgres/migrations/002-audit.sql`; `packages/audit/src/{append,verify,export}.ts`; `tests/integration/audit.test.ts`; `docs/runbooks/audit.md`.

Interfaces: `appendReceipt(receipt: Omit<AuditReceipt, 'sequence' | 'previousHash' | 'signature'>): Promise<AuditReceipt>`; `verifyReceiptChain(receipts: AuditReceipt[]): Promise<{valid: boolean; reason?: string}>`.

- [ ] Assert concurrent receipts have unique increasing sequence; modified hash/signature, deleted-middle event, and mismatched exported terminal checkpoint fail verification; rotated keys remain verifiable. Raw secret fixtures never appear in exported receipt payload.
- [ ] Run audit integration test for RED; implement canonical signing bytes, server timestamps, append-only role, key IDs, external checkpoint export, and unknown-outcome records.
- [ ] Run test for GREEN and simulate unavailable receipt storage: new effects deny instead of continuing unaudited. Operator can verify backup chain independently.
- [ ] Record administrative/tail-truncation limits honestly and commit.

### Task 06: Shared budgets, reservations, and self-state

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R14, R23. Dependencies: 05.

Files: `db/postgres/migrations/003-budgets.sql`; `packages/budgets/src/{reserve,settle,self-state}.ts`; `packages/budgets/test/budgets.test.ts`; `tests/integration/budget-races.test.ts`.

Interfaces: `reserveBudget(ref: BudgetRef, tokens: number, maxCostMicroUsd: number): Promise<BudgetReservation>`; `settleBudget(reservationId: string, actualTokens: number, actualCostMicroUsd: number): Promise<void>`; `getSelfState(context: RunContext): Promise<{remainingTokens: number; remainingCostMicroUsd: number; degradedCapabilities: string[]}>`.

- [ ] Assert 20 concurrent reservations cannot exceed a fixture quota of 1000 micro-USD; duplicate settlement is idempotent; child usage debits the same parent/tenant budget; unresolved calls retain conservative reservations.
- [ ] Run unit/race tests for RED; implement atomic reservation/CAS, conservative provider max-output estimates, cancellation reconciliation, and budget snapshot. Missing deployment quotas fail startup.
- [ ] Run both tests for GREEN; verify over-budget route does not initiate provider/tool network requests.
- [ ] Document overrun/unknown-provider-billing reconciliation and commit.

### Task 07: Out-of-process policy kernel and approval binding

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R03, R08, R22, R24. Dependencies: 03–06.

Files: `packages/policy/src/{evaluate,modes,approvals,capabilities}.ts`; `apps/policy-kernel/src/main.ts`; `infra/policies/default.yaml`; `tests/security/policy.test.ts`.

Interfaces: `authorizeEffect(request: EffectRequest, principal: Principal): Promise<PolicyDecision>`; `approveEffect(record: ApprovalRecord): Promise<void>`; `validateExecutionCapability(token: string, request: EffectRequest): Promise<void>`.

- [ ] Assert direct privilege escalation denies, observe cannot write, approval for input hash A cannot authorize B, nonce replay denies, stale epoch denies, and policy service failure blocks execution. Allowed reduction preserves authority subset.
- [ ] Run security test for RED; implement capability-set modes, authenticated approval endpoints, effect/input/artifact/policy binding, short expiry, policy version verification, and signing outside agent mounts.
- [ ] Run real separate-process test for GREEN; kill kernel and prove tool/model/shared-memory publication stops. Agent OS identity cannot modify policy files.
- [ ] Record approval UX/status and protected paths; commit after security review.

## 6. Stage B — protected vertical slice

### Task 08: Single-owner SQLite episodes, FTS, fencing, lineage

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R08, R09, R11, R23. Dependencies: 04, 07.

Files: `db/sqlite/migrations/001-episodes.sql`; `packages/episodic/src/{append,search,lineage,reconcile}.ts`; `apps/episodic-owner/src/main.ts`; `tests/integration/episodes.test.ts`.

Interfaces: `appendEpisode(command: EpisodeCommand): Promise<AppendReceipt>`; `searchEpisodes(principal: Principal, sessionId: string, query: string, limit: number): Promise<Episode[]>`; `recordCompression(record: CompressionRecord): Promise<void>`.

- [ ] Assert stale writer appends zero records; duplicate command returns original receipt; FTS never returns another tenant/session; compression records reference unchanged raw episode digests.
- [ ] Run episode tests for RED; implement local-volume WAL/FTS, FULL acknowledged durability, sole file ownership, and spec section 10 PG-row-lock → SQLite commit → PG projection reconciliation sequence.
- [ ] Test crash immediately after SQLite commit and before PG commit; retry deduplicates and repairs cursor. Test lease takeover during append contention; superseded run cannot write.
- [ ] Run for GREEN; add WAL checkpoint/backup/SQLITE_BUSY/disk-full runbook and commit. Never place the active file on network-shared or OneDrive-synced storage.

### Task 09: Hierarchical memory broker with real RLS enforcement

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R06, R10, R11, R23. Dependencies: 04, 07, 08.

Files: `db/postgres/migrations/004-memory-rls.sql`; `packages/memory/src/{query,publish,revisions}.ts`; `apps/memory-broker/src/main.ts`; `tests/security/memory-rls.test.ts`.

Interfaces: `queryMemory(principal: Principal, query: MemoryQuery): Promise<MemoryRecord[]>`; `publishMemory(principal: Principal, write: MemoryWrite, expectedVersion: number | null): Promise<MemoryRecord>`; `revertMemoryRevision(principal: Principal, memoryId: string, revisionId: string): Promise<MemoryRecord>`.

- [ ] Assert tenant A sees none of tenant B’s lexical/vector results; Role scope excludes other roles; Private scope excludes other agents; scope escalation rejects; two writers with the same expectedVersion cannot both succeed.
- [ ] Run RLS test for RED under the real runtime non-owner role; implement FORCE RLS, USING/WITH CHECK, trusted transaction-local settings, broker-only credentials, CAS/provenance/sensitivity checks. Reject caller-supplied identity settings.
- [ ] Test pooled connection reuse, malicious tenant fields, permission revocation, and vector top-k with unauthorized closer neighbors. Run for GREEN.
- [ ] Document scope queries and restoration; commit after review. Memory embeddings are added through Task 11’s privacy route, never direct provider calls.

### Task 10: Redacted telemetry facade and basic eval corpus

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R19, R23. Dependencies: 02, 05.

Files: `packages/telemetry/src/{spans,redaction,metrics}.ts`; `packages/telemetry/test/privacy.test.ts`; `evals/cases/control.jsonl`; `docs/runbooks/observability.md`.

Interfaces: `startRunSpan(context: RunContext): TraceHandle`; `recordUsage(context: RunContext, tokens: number, costMicroUsd: number): void`; `recordQuality(context: RunContext, evalId: string, score: number): void`.

- [ ] Assert spans correlate gateway/run/task/effect IDs and expose tokens/cost/latency/errors; seeded email/API-key/prompt secrets are absent from exported attributes. Exporter failure preserves control operation and durable receipts.
- [ ] Run telemetry test for RED; implement facade, OTel exporter, Langfuse integration behind configuration, redaction defaults, queue depth/lease/conflict/privacy-denial metrics.
- [ ] Run for GREEN; add deterministic golden cases for simple retrieval, denied write, tool timeout, memory recall, and duplicate input. Quality targets attach to the approved real tasks rather than borrowed paper results.
- [ ] Commit telemetry/eval foundation.

### Task 11: Privacy router, provider adapters, and inference accounting

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R05, R14, R19, R22. Dependencies: 03, 05–07, 10.

Files: `packages/privacy/src/{classify,redact,route}.ts`; `packages/models/src/{generate,embed,providers}.ts`; `apps/privacy-router/src/main.ts`; `tests/security/privacy-routing.test.ts`.

Interfaces: `routeInference(request: ModelRequest, principal: Principal): Promise<ModelResult>`; `embedText(principal: Principal, context: RunContext, text: string, sensitivity: string): Promise<{vector: number[]; modelId: string}>`.

- [ ] Assert sensitive local-only text never reaches mocked cloud transport, including embedding/judge/summarizer cases; unavailable local route denies; disallowed destination or missing budget makes zero external calls. Nonsensitive approved input routes correctly.
- [ ] Run privacy test for RED; implement configured classifier/redactor, explicit uncertainty routing, provider credentials only in router, streaming limits, cancel, conservative usage settlement, and receipts.
- [ ] Run real private-network test proving orchestrator/specialist cannot reach provider directly. Router fallback rechecks sensitivity/destination/cost; redaction coverage measured with a seeded corpus.
- [ ] Commit; document local hardware/model availability and no differential-privacy claim.

### Task 12: Implement and qualify native Windows isolation

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R03, R07, R22, R23. Dependencies: 03, 07.

Files: `packages/sandbox/src/{port,windows,qualification,index}.ts`; `packages/sandbox/test/windows.test.ts`; `tests/security/sandbox.test.ts`.

Interfaces: `executeIsolated(manifest: ToolManifest, input: unknown, context: RunContext, signal: AbortSignal): Promise<{exitCode: number; output: unknown; artifacts: string[]}>`; `qualifySandbox(backend: string): Promise<{qualified: boolean; checks: Record<string, boolean>}>`.

- [ ] Assert denied filesystem path, network destination, cloud metadata endpoint, secret environment variable, privilege/syscall, and host/container socket are inaccessible. CPU/memory/output/time limits terminate the workload and descendants.
- [ ] Run the real sandbox suite against the selected Windows-hosted backend for RED; implement fresh workspaces, read-only roots, least privilege, resource limits, egress fence/proxy and manifest-bound mounts. Do not require Linux-specific controls for a native Windows implementation; prove actual Windows isolation, filesystem permissions, process-tree/resource and egress restrictions. No Node worker_threads substitute.
- [ ] Implement and qualify the native Windows backend for reviewed built-ins. Generated/untrusted execution remains unavailable until qualified VM isolation is separately implemented; a future Linux guest is allowed only if mandatory for that scoped VM feature. Do not block unrelated Windows implementation on it.
- [ ] Run for GREEN per backend and record kernel/runtime/image digest/evidence. Commit profiles; no approval of real tool effects is implied by sandbox availability.

### Task 13: Verified tool registry and durable effect execution

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R07, R08, R11, R15, R22. Dependencies: 05–07, 12.

Files: `packages/tools/src/{manifests,registry,dispatch,effect-journal,normalize}.ts`; `apps/tool-engine/src/main.ts`; `tests/security/tool-execution.test.ts`.

Interfaces: `registerTool(manifest: ToolManifest): Promise<void>`; `dispatchTool(toolId: string, input: unknown, context: RunContext, principal: Principal, signal: AbortSignal): Promise<ToolResult>`; `reconcileEffect(effectId: string): Promise<ToolResult>`.

- [ ] Assert tampered/revoked manifest never registers, invalid input never invokes handler, runtime throw becomes NormalizedError, duplicate logical effect reuses journal outcome, and unknown non-idempotent result does not execute again.
- [ ] Run tool suite for RED; implement manifest-first discovery, fail-closed availability checks, policy/epoch/budget validation, intent journal, isolated handler execution, schema-validated bounded results, receipts, and two error normalization boundaries.
- [ ] Test approve→artifact replacement race (digest mismatch denies), cancellation after start, kill-after-effect-before-receipt, oversized output as artifact reference, and unauthorized tool-result instructions. Output remains untrusted data.
- [ ] Run for GREEN; commit after security review.

### Task 14: Deterministic capability routing and BullMQ task transport

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R06, R12, R14, R23. Dependencies: 03, 04, 06, 13.

Files: `packages/specialists/src/{rank,queue,worker}.ts`; `apps/specialist/src/main.ts`; `packages/specialists/test/rank.test.ts`; `tests/integration/tasks.test.ts`.

Interfaces: `rankWorkers(task: TaskEnvelope, workers: WorkerDescriptor[]): WorkerDescriptor[]` (WorkerDescriptor exported from contracts with workerId, capabilities, health, capacity); `enqueueTask(task: TaskEnvelope): Promise<void>`; `executeTask(task: TaskEnvelope, signal: AbortSignal): Promise<TaskResult>`.

- [ ] Assert exact capability matches rank before partial matches; missing mandatory capability never dispatches; ties sort by stable workerId; unhealthy/full workers exclude; duplicate BullMQ delivery produces one logical completion.
- [ ] Run rank/tasks tests for RED; implement QueuePort/BullMQ adapter, outbox publication, reduced grants, concurrency/backpressure, deadlines/depth/8-task fanout cap, and 12-iteration shared parent cap.
- [ ] Run for GREEN with worker restart; unknown requirements return unsupported/escalate to bounded supervisor planning, never gain arbitrary tools. Do not add JetStream or peer swarm handoffs.
- [ ] Commit deterministic fleet foundation (one specialist enabled initially).

### Task 15: Mastra adapter inside deterministic run state machine

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R04, R05, R08, R12, R14, R23. Dependencies: 08–14.

Files: `packages/orchestrator/src/{mastra-adapter,run,transitions,finalize}.ts`; `apps/orchestrator/src/main.ts`; `packages/orchestrator/test/run.test.ts`.

Interfaces: `startRun(event: SessionEvent): Promise<{runId: string}>`; `resumeRun(runId: string, principal: Principal): Promise<void>`; `cancelRun(runId: string, principal: Principal): Promise<void>`; `advanceRun(context: RunContext): Promise<TaskResult>`.

- [ ] Assert fake model sequence delegates one allowed tool, observes result, emits final answer; 13th model call never starts; delegation depth 3 rejects; invalid model/task output fails validation; cancelled run cannot finalize.
- [ ] Run state-machine test for RED; integrate Mastra behind a port, immutable transition table, context assembly, shared budgets, persisted model/tool observations/checkpoints, writer epoch, tool-free finalization when required, and bounded failure outcomes.
- [ ] Run for GREEN; replay consumes recorded results and does not repeat external calls. Model/provider or Mastra internal memory/tool defaults cannot bypass custom privacy/tool/memory ports.
- [ ] Commit deterministic orchestrator.

### Task 16: Gateway, web/CLI surfaces, return delivery, and vertical-slice acceptance

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R01, R02, R08, R12, R15, R21, R23. Dependencies: 15.

Files: `packages/gateway/src/{ingress,sessions,stream,delivery}.ts`; `apps/gateway/src/main.ts`; `apps/cli/src/main.ts` when enabled; `packages/channels/src/port.ts`; `tests/e2e/vertical-slice.test.ts`. The frontend guide owns `apps/web` and `apps/gateway/src/ui/*`; one Gateway owner coordinates the shared composition root.

Interfaces: `handleIngress(event: SessionEvent, principal: Principal): Promise<{acceptedId: string; runId?: string}>`; `deliverReply(record: DeliveryRecord): Promise<DeliveryRecord>`; ChannelAdapter exposes `normalize(input: unknown): Promise<SessionEvent>` and `send(record: DeliveryRecord): Promise<{remoteReceiptId?: string; status: 'sent' | 'unknown'}>`.

- [ ] Assert a browser-compatible authenticated Gateway contract client (and CLI when enabled) → durable gateway ingress → episode owner → orchestrator → one specialist → tool engine → qualified sandbox → final client result yields correlated receipt/episode/task IDs. Duplicate input yields one reply; revoked/stale run cannot deliver. UI tasks U08/U09 define card behavior; U19 adds actual browser proof after this backend slice passes, so task 16 does not depend on U19.
- [ ] Run e2e test for RED; implement Hono authenticated endpoints, 1 MiB input limit, session routing, durable acceptance, progress cursor, delivery outbox and confirmation, explicit no-reply semantics. Basic authenticated web projection/stream routes may be delivered by U17 before task 15; mark this system task complete only when its real protected flow gate passes.
- [ ] Run for GREEN; restart gateway after acceptance and before reply; delivery recovers. On ambiguous non-idempotent channel sends, mark unknown and reconcile rather than resend blindly.
- [ ] **Stage B gate:** demonstrate one useful approved task and denied action, privacy route, RLS, fence, timeout, receipt verification, and restart recovery. Record evidence before calling this a protected vertical slice.
- [ ] Commit; do not expand fleet/learning before this gate passes.

## 7. Stage C — useful assistant and durable operation

### Task 17: Cache-aware context compression and authorized recall

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R05, R09–11, R13, R14. Dependencies: 16.

Files: `packages/context/src/{assemble,tokens,compress,recall}.ts`; `packages/context/test/compression.test.ts`; `tests/integration/compression-lineage.test.ts`.

Interfaces: `assembleContext(context: RunContext): Promise<ModelRequest>`; `shouldCompress(usedTokens: number, windowTokens: number): 'none' | 'consider' | 'force'`; `compressSuffix(request: ModelRequest, context: RunContext): Promise<ModelRequest>`.

- [ ] Assert `shouldCompress(49,100)==='none'`, `(50,100)==='consider'`, `(85,100)==='force'`; stable prefix bytes/hash unchanged; tool-call/result groups remain intact; malformed summary leaves original context and fails safely before overflow.
- [ ] Run tests for RED; implement calibrated tokenizer/provider accounting, reserved summary/output overhead, suffix summarization through privacy router, immutable episode lineage, summary sensitivity/scope inheritance, and bounded recall.
- [ ] Run for GREEN; recover a fact removed from active suffix through authenticated episodic recall. Measure actual provider cache metrics without asserting universal hits.
- [ ] Commit; include overlarge stable prefix and compression budget exhaustion fixtures.

### Task 18: Signed skill manifests, selective injection, and revocation

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R03, R07, R11, R24. Dependencies: 16, 13.

Files: `packages/skills/src/{discover,verify,select,install,revoke}.ts`; `packages/skills/test/skills.test.ts`; `db/postgres/migrations/005-skills.sql`.

Interfaces: `installSkill(manifest: SkillManifest, principal: Principal): Promise<{skillVersionId: string}>`; `selectSkills(context: RunContext, taskCapabilities: string[]): Promise<SkillManifest[]>`; `revokeSkill(skillVersionId: string, principal: Principal): Promise<void>`.

- [ ] Assert tampered/revoked publisher or artifact rejects; irrelevant skill is not injected; scripts cannot execute at discovery; skill cannot expand caller scope, rewrite policy, or authorize an action through prose.
- [ ] Run skills test for RED; implement declarative manifest discovery, digest/publisher trust records, exact artifact pinning, review lifecycle, scoped relevance, and install audit.
- [ ] Run for GREEN with revoked skill already selected: execution still rechecks current trust/policy. Markdown instruction content remains below application/system enforcement.
- [ ] Commit supply-chain boundary.

### Task 19: Checkpoint recovery, approvals, cancellation, and dependency failure

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R08, R12, R15, R22, R23. Dependencies: 16, 07.

Files: `packages/orchestrator/src/{recover,retry,circuit-breaker}.ts`; `packages/gateway/src/approvals.ts`; `tests/integration/recovery.test.ts`; `docs/runbooks/recovery.md`.

Interfaces: `recoverRuns(limit: number): Promise<number>`; `resumeApprovedRun(runId: string, approvalId: string, principal: Principal): Promise<void>`; `classifyRetry(error: NormalizedError, effectId: string): 'retry' | 'reconcile' | 'fail'`.

- [ ] Assert kill before/after checkpoint, lost queue lock, expired approval, provider 429, Redis partition, PostgreSQL failure, and SQLite disk-full each resolve to specified state. Unknown external effect classifies reconcile, not retry; cancelled descendants cannot publish late results.
- [ ] Run recovery suite for RED; implement persistent attempt/state recovery, jittered bounded backoff, per-dependency circuit breakers, hard abort, lease fencing, matching approval resume, and delivery reconciliation.
- [ ] Run for GREEN under fault injection. Mastra snapshots are verified with this pinned adapter; they are not assumed to confer exactly-once external effects. Introduce Temporal only through a reviewed durability ADR if requirements exceed this tested substrate.
- [ ] Commit and record operator recovery commands/outcomes.

### Task 20: Slack adapter through the gateway

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R01, R02, R15, R21. Dependencies: 16, 19.

Files: `packages/channels/src/slack.ts`; `tests/integration/slack.test.ts`; `docs/runbooks/channels.md`.

Interfaces: implements ChannelAdapter; no new model/tool path.

- [ ] Assert webhook signature/timestamp rejects forged/stale requests; redelivery deduplicates; thread identity maps consistently; outbound uncertainty is tracked; destination tenant mismatch rejects.
- [ ] Run Slack test for RED; implement official adapter using gateway principal/session mapping, rate limits, bounded attachment references, delivery receipts, and platform error normalization.
- [ ] Run for GREEN with recorded fixtures; live app registration/credentials require user-provided authorized account setup before live validation. Do not claim live support from fixtures alone.
- [ ] Commit adapter and document exact supported message/attachment types.

### Task 21: Durable heartbeat scheduling with quiet/no-op behavior

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R12, R14, R23. Dependencies: 06, 16, 19.

Files: `packages/gateway/src/heartbeat.ts`; `tests/integration/heartbeat.test.ts`; `db/postgres/migrations/006-schedules.sql`.

Interfaces: `scheduleHeartbeat(principal: Principal, sessionId: string, intervalSeconds: number): Promise<{scheduleId: string}>`; `runDueHeartbeats(now: string): Promise<number>`.

- [ ] Assert duplicate scheduler ownership launches one logical tick; no-change result emits zero user messages; exhausted heartbeat budget produces zero model calls; offline/restart does not replay an unbounded backlog.
- [ ] Run heartbeat test for RED; implement durable schedule leases, per-schedule spend caps, bounded catch-up, quiet hours in tenant timezone, and gateway re-entry with the same policy path.
- [ ] Run for GREEN; cancellation removes future ticks; non-actionable output is suppressed while meaningful completion/failure/action-needed delivery is tracked.
- [ ] Commit scheduler; schedules are opt-in product settings, not automations installed by this planning session.

## 8. Stage D — protocols, bounded scale, and production release

### Task 22: MCP adapter and protocol/auth compatibility

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R07, R11, R18, R22. Dependencies: 13, 19.

Files: `packages/protocols/src/mcp/{client,server,auth,versions}.ts`; `tests/protocols/mcp.test.ts`; `docs/decisions/0002-mcp-revision.md`.

Interfaces: `connectMcpServer(endpoint: string, principal: Principal): Promise<{serverId: string}>`; `callMcpTool(serverId: string, toolName: string, input: unknown, context: RunContext): Promise<ToolResult>`.

- [ ] Qualify pinned SDK for target 2026-07-28 transport; old 2025-11-25 behavior must have an explicit compatibility fixture/decision. A version mismatch is a protocol error, not a guessed downgrade.
- [ ] Assert disallowed Origin/redirect/SSRF destination rejects, auth audience/resource mismatch rejects, unknown tool/schema rejects, cancellation/deadline is honored, and remote result cannot execute instructions or escape output bounds.
- [ ] Run protocol suite for RED; implement versioned transport adapter, official auth requirements, allowlisted endpoints, TLS, credential scoping, tool/result schemas and policy/effect journal integration.
- [ ] Run for GREEN against a real local test server; expose only approved tool manifests through server. Commit after protocol/security review.

### Task 23: A2A Agent Cards and bounded remote tasks

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R06, R11, R12, R18. Dependencies: 13, 14, 19.

Files: `packages/protocols/src/a2a/{card,client,server,state-map}.ts`; `tests/protocols/a2a.test.ts`.

Interfaces: `getAgentCard(principal: Principal): Promise<unknown>` (validate pinned A2A SDK schema); `submitRemoteTask(cardUrl: string, task: TaskEnvelope, principal: Principal): Promise<TaskResult>`.

- [ ] Assert card discovery does not contain secrets; wrong protocol/auth/tenant rejects; remote cancelled/failed/input-required states map explicitly; delegated capability grant is narrower; remote artifacts are untrusted/bounded.
- [ ] Run A2A suite for RED; implement 1.0.0 card/task adapter, allowlisted discovery, auth, status streaming/cursors, cancellation, deadline, and durable remote task IDs. JSON-RPC binding first; other bindings require their own qualification.
- [ ] Run for GREEN against an independent test agent. Record that remote agent execution is outside local sandbox authority and must be approved separately.
- [ ] Commit; MCP tool calls and A2A task lifecycle stay distinct.

### Task 24: Fleet capacity and WhatsApp/Discord adapters

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R01, R06, R08, R12, R14, R21. Dependencies: 20, 22, 23.

Files: `packages/specialists/src/capacity.ts`; `packages/channels/src/{whatsapp,discord}.ts`; `tests/integration/fleet.test.ts`; `tests/integration/channel-parity.test.ts`.

Interfaces: existing WorkerDescriptor, TaskEnvelope and ChannelAdapter; no direct specialist-to-specialist swarm API.

- [ ] Assert 10 concurrent sessions make progress under configured worker capacity; one session preserves ordered writer commits; same tenant quota holds across all workers; queue depth triggers backpressure.
- [ ] Assert channel auth, session mapping, duplicate suppression, revoked destination, attachment bounds, and confirmation handling satisfy the same parity suite for CLI/Slack/WhatsApp/Discord.
- [ ] Run for RED; implement bounded scaling/health/capacity and named adapters with approved official provider APIs. Separate fixture validation from live-account acceptance.
- [ ] Run for GREEN; benchmark routing/coordination overhead and retain supervisor topology unless an approved ADR permits handoffs.
- [ ] Commit. Before adding remaining surfaces, write an approved inventory with each platform’s auth/rate/attachment/delivery requirements; do not assert “20+ implemented.”

### Task 25: Production hardening, restore, retention, and first release

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R09, R15, R19, R22, R23. Dependencies: 17–24.

Files: `infra/compose.yaml` production profiles; `tests/release/{restore,retention,startup}.test.ts`; `tests/load/assistant.test.ts`; `docs/runbooks/{deploy,backup,retention,incident-response,key-rotation}.md`; `docs/release-evidence/stage-d.md`.

Interfaces: `pnpm test:load`, `pnpm test:e2e`, documented restore/rollback operator commands; no new public capability.

- [ ] Assert health/readiness refuses missing policy keys/quotas/unqualified sandbox; restore recovers episodes+lineage+memory+receipts+pending deliveries with valid chain; authorized deletion removes source and derived projections without retaining secret payload in receipt.
- [ ] Run release suite for RED; implement TLS/front-door controls, private networks, migration ordering, secrets/bootstrap, backups, retention, disk alerts, graceful drain, and image/digest inventory. Owner data and VM volumes remain outside workstation sync/network folders. Validate Windows service startup/shutdown, ACLs, paths, secrets, restore and update/rollback behavior.
- [ ] Run lint/type/build/unit/integration/security/protocol/e2e/load/architecture/dependency/traceability suites for GREEN; record zero skipped critical checks and seeded secret-leak failures.
- [ ] Load gate: 10 concurrent sessions, 100 deterministic seeded requests, zero cross-tenant/stale commits and zero duplicate fixture effects; framework overhead p95 under 1 second excluding provider/tool time on recorded hardware. Real model end-to-end latency and quality get an approved workload-specific baseline.
- [ ] Recovery target proposed for this first service: daily backups, RPO ≤24 hours, RTO ≤2 hours, proved by a timed clean-host restore. Stronger requirements need a reviewed availability/storage decision.
- [ ] **Stage D gate:** user-facing release evidence names supported features, live-vs-fixture integration status, limitations, spend caps and rollback. Commit release artifact; external deployment/publication is a separate authorized action.

## 9. Stage E — experimental background learning

### Task 26: Offline consolidation with scoped CAS publication

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R05, R09–11, R14, R16, R23. Dependencies: 25, 09, 11, 17.

Files: `packages/consolidation/src/{extract,cluster,propose,publish,rollback}.ts`; `apps/consolidator/src/main.ts`; `tests/security/consolidation.test.ts`; `evals/cases/recall.jsonl`.

Interfaces: `proposeConsolidation(principal: Principal, episodeIds: string[]): Promise<ConsolidationPlan>`; `publishConsolidation(plan: ConsolidationPlan, principal: Principal): Promise<{revisionIds: string[]}>`.

- [ ] Assert ambiguous/contradictory facts remain separate; private source cannot become Role/Global summary; CAS conflict publishes nothing for that planned unit; repeated plan is idempotent; rollback restores prior revision references; raw episodes remain unchanged.
- [ ] Run suite for RED; implement bounded off-path extraction/clustering and preservation-based merges, hypothesis-tagged cross-domain links, privacy-routed inference, provenance, approval/publication receipts, and separate resource/spend quotas.
- [ ] Run for GREEN; eval on reviewed held-out recall cases must not regress baseline; background load must increase foreground retrieval p95 by no more than 5% on recorded test hardware. This is a measured performance gate, not a claim of zero resource interference.
- [ ] Commit shadow mode first. Enable reversible publication only after review; automatic raw-source deletion/forgetting is outside this task’s authority.

### Task 27: Generated tool candidates in microVM shadow mode

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R03, R07, R11, R15, R17. Dependencies: 25, 12, 13, 18.

Files: `packages/evolution/src/{tool-candidate,shadow-tool}.ts`; `tests/security/tool-synthesis.test.ts`; `db/postgres/migrations/007-learning.sql`.

Interfaces: `createToolCandidate(manifest: ToolManifest, artifactRef: string, principal: Principal): Promise<Candidate>`; `evaluateToolCandidate(candidateId: string): Promise<EvalReport>`.

- [ ] Assert generated code cannot register itself, see policy/keys, open forbidden egress, modify goldens, or inherit parent privileges; unqualified microVM refuses execution; shadow output never causes real external side effects.
- [ ] Run for RED; implement Manager/Developer/Executor separation inside the approved candidate workflow, manifest/schema/tests/signature checks, ephemeral microVM, deterministic replay fixture comparison, archive/provenance, and reviewed promotion to registry.
- [ ] Run for GREEN; generated tool remains draft/shadow until an independent reviewer authorizes the exact artifact hash and permissions.
- [ ] Commit experimental tool synthesis; capture cost/quality versus existing tools.

### Task 28: Optional observation graph and verified knowledge exchange

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R10, R11, R16, R24. Dependencies: 26; explicit scope review because these report extensions are not separate required screenshot nodes.

Files: `packages/observations/src/{record,query,exchange}.ts`; `tests/security/observations.test.ts`; `db/postgres/migrations/008-observations.sql`.

Interfaces: `recordObservation(principal: Principal, observation: Observation): Promise<{observationId: string}>`; `queryObservations(principal: Principal, entityId: string): Promise<Observation[]>`; `importKnowledge(principal: Principal, manifest: SkillManifest): Promise<{candidateId: string}>`.

- [ ] Assert timestamped/provenance-tagged conflicting observations coexist; confidence is not authorization; private sources stay private; imported playbooks are data and cannot install/execute themselves.
- [ ] Run for RED; implement scoped entity/relation tables within existing PostgreSQL/memory broker, validity/expiry, and signature-pinned knowledge candidates. No Neo4j/graph extension is added without an approved dependency ADR.
- [ ] Run for GREEN; planner only receives bounded retrieved facts, with explicit source uncertainty.
- [ ] Commit if approved. Otherwise record skipped-by-scope; no claimed implementation, and Task 29 does not require this optional extension.

## 10. Stage F — guarded scaffold evolution and final conformance

### Task 29: Candidate archive, independent eval, canary promotion, rollback

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R02, R03, R07, R14, R15, R17, R24. Dependencies: 25–27.

Files: `packages/evolution/src/{archive,protected-paths,benchmark,promote,rollback}.ts`; `apps/evolution-engine/src/main.ts`; `tests/security/evolution.test.ts`; `evals/held-out/`; `docs/runbooks/evolution.md`.

Interfaces: `evaluateCandidate(candidate: Candidate): Promise<EvalReport>`; `decidePromotion(report: EvalReport, principal: Principal): Promise<PromotionDecision>`; `promoteCandidate(candidateId: string, decision: PromotionDecision): Promise<{releaseId: string}>`; `rollbackRelease(releaseId: string, principal: Principal): Promise<void>`.

- [ ] Assert changes to policy, contracts, approval/signing code, baseline, CI enforcement, goldens, credentials, or protected tests deny; symlink/traversal/renamed path tricks deny. Candidate cannot read or modify held-out labels.
- [ ] Run for RED; implement content-addressed candidate lineage/archive, static/security/schema checks, independent microVM benchmark, adversarial eval, policy permission-diff check, signatures, human-reviewed canary publication, rollback pointer.
- [ ] Promotion gate: zero governance regressions; exact protected file digests unchanged; held-out primary task score improves by a predeclared statistically supported margin; latency/cost stay within the approved evaluation budget. Define workload/sample size before running, not after seeing results. No universal numeric “intelligence” score is invented.
- [ ] Run for GREEN including failed canary and automatic rollback of deployment pointer; candidate cannot rewrite the evaluator/promotion rule. All eval/model calls use privacy router and separate explicit budgets.
- [ ] Commit shadow/candidate mode first; autonomous promotion is a separate reviewed policy change. Model-weight self-modification is excluded.

### Task 30: Full conformance, agent workflow enforcement, and handoff

Execution target: Windows development and deployment. Linux is not required; a future guest is allowed only if mandatory for a scoped VM feature. See ADR 0004. All required service/security checks and dependencies remain.

Requirements: R01–R24. Dependencies: 29; Task 28 recorded as implemented or explicitly excluded.

Files: `tests/architecture/{baseline,protected-paths,traceability}.test.ts`; `tests/e2e/full-flow.test.ts`; `scripts/verify-all.mjs`; `docs/release-evidence/full-system.md`; update AGENTS.md/ledger only through approved governance review.

Interfaces: `pnpm verify` plus all release suites; architecture-baseline/requirement coverage remains machine-readable and protected.

- [ ] Assert removal of any pictured node, forbidden direct channel/model path, worker credential inheritance, bypassed privacy/memory port, unsigned install, missing requirement test, or modified protection without approved ADR fails conformance.
- [ ] Run conformance tests for RED; wire provider-neutral CI/release checks, reviewed branch protection once a remote is chosen, candidate task file scopes, and approval evidence for protected changes. Local hooks alone are not sufficient enforcement.
- [ ] Run all required suites for GREEN on a clean Windows host with frozen install and any selected VM images. Repeat guest isolation tests only when that VM backend is used; standalone Linux release is deferred. Verify positive end-to-end and denied end-to-end flows; perform independently witnessed restore/receipt verification.
- [ ] Produce final component-to-code-to-test-to-evidence matrix, full run/learning/evolution trace, operator runbooks, exact supported protocol/channel/backend matrix, and measured cost/latency/quality comparison.
- [ ] Commit/handoff only with approved integration method. Do not mark the entire roadmap complete while optional/unsupported features remain unlabeled.

## 11. Small details that are release requirements

These are owned by the task IDs shown and must be in their fixtures/runbooks rather than left to agent improvisation.

| Detail | Rule | Task |
|---|---|---|
| IDs and time | Opaque IDs; UTC wire timestamps/deadlines; tenant timezone only for schedules/display | 02, 21 |
| Monetary math | Integer micro-USD; no floating-point quota comparisons | 02, 06 |
| Input limits | 1 MiB JSON; attachment references with size/MIME/provenance, no unbounded inline blobs | 02, 16, 20, 24 |
| Tool output | 64 KiB inline; artifact references beyond that; exact output schema and normalized error | 13 |
| Interactive limits | 120-second run, 30-second default tool, 12 model iterations, depth 2, fanout 8, retry attempts 3 for known retryable failures | 06, 13–16, 19 |
| Lease timing | 30-second lease; renew every 10 seconds using server time; monotonically increasing epoch | 04, 08, 15 |
| Restart boundaries | Crash tests around each durable append/effect/delivery/commit boundary; unresolved effects retained | 04, 08, 13, 19, 25 |
| SQL roles | Migration owner separate from runtime; FORCE RLS; no runtime superuser/BYPASSRLS; broker authenticates scope | 09 |
| Vector retrieval | Tenant/scope filter in actual query; dimensions/provider version recorded; no client-side post-filter-only protection | 09, 11 |
| Local-only data | Failure to run approved local model denies cloud fallback; redaction ambiguity stays restricted | 11 |
| DNS/egress | Reject metadata/private/redirect targets unless approved; authorization binds destination and method | 07, 12, 22, 23 |
| Manifest lifecycle | Digest/signature/revocation checked at install and execution; do not execute while discovering | 13, 18, 27 |
| Approvals | Authenticated approver; exact input/artifact/policy hash; expiration/single use; status visible | 07, 19 |
| Memory revision | Version CAS; provenance/source IDs; no audience widening; contradictory facts preserve evidence | 09, 26, 28 |
| Cache correctness | Stable prefix byte hash; token accounting plus provider overhead; no orphan tool groups | 17 |
| Trace privacy | Payload collection opt-in/reviewed; exports redact sensitive keys; telemetry is not audit authority | 05, 10 |
| Cancellation | Abort provider/queue/handler, terminate child processes, revoke stale authority, deny late publication | 12–16, 19 |
| Shutdown | Stop acceptance, drain bounded work, persist remaining state, release/expire leases safely | 19, 25 |
| Backup | PostgreSQL consistent backup plus SQLite backup API/WAL-consistent snapshot; timed clean restore | 08, 25 |
| Keys/secrets | Separate scoped service secrets, key IDs/rotation/revocation; no secrets in source/log/eval snapshots | 03, 05, 25 |
| Data deletion | Explicit approved retention settings; remove derived source projections; minimal non-content receipt | 25 |
| Upgrade | Exact version/digest inventory, schema/protocol compatibility fixtures, reversible rollout | 01, 02, 22, 23, 25 |
| Eval independence | Held-out tests outside candidate write scope; predeclared criteria; model judges treated as fallible evidence | 10, 26, 29 |
| CI honesty | Missing security infrastructure fails gate; no critical skips, fake pass, or disabling protections | 01, 30 |

## 12. Completion and next decision

Planning is complete when the spec and this plan can be reviewed together, every pictured component/requirement maps to tasks, dependencies are acyclic, links exist, and all unresolved product/deployment choices are explicit.

Implementation begins only after review of the proposed spec/plan and selection of execution method. Recommended execution: first run Tasks 01–16 sequentially with distinct review for security boundaries; authorize independent task agents later only where completed contracts and disjoint files make that safe. The next concrete build action is Task 01, not scaffolding the entire roadmap or jumping to DGM.

No implementation tests have been run in this planning task because application/test code does not yet exist. Document validation is reported separately from future system validation.
