# ASI Models Batch 01: Core and control records

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is a task-detail plan under the master plan; preserve the established native sequential execution method.

**Goal:** Implement and qualify the 6 model/projection families below.

**Architecture:** Focused JavaScript facades consume canonical owner ports. New SQL is confined to permitted SQL owners; projections have no independent writer.

**Tech Stack:** Existing Node/Express/PostgreSQL/pgvector/Zod/TypeScript workspace; no new third-party dependencies.

**Spec:** [Approved model design](../specs/2026-10-21-asi-backend-models-design.md).

## Global Constraints

All constraints, result/page types, scope binding, SQL field-map rules and acceptance checks in the [master plan](2026-10-21-asi-backend-models.md) apply verbatim. Public HTTP schemas/controllers remain later work; current task statuses and product capabilities are unchanged.

## Review Focus

Exercise cross-tenant references, altered idempotent payloads, stale revisions, corrupt persisted identity/digests and unavailable owners. In this batch also cover: a stale plan revision after the goal changes; one cross-tenant goal/artifact reference; cancelled writer during lock wait; same ID with changed plan digest; corrupt JSON/column identity; repeat append with identical payload; artifact bytes missing; project completion with unknown verification.

## Interfaces consumed and migration boundary

Existing RunContext, GoalSpec/GoalRecord, TaskPlan, ProjectRecord, Task/TaskResult and ArtifactReference contracts; current control writer fencing and transaction primitives.

Migration target: BM01; files: 017-model-core.sql plus the existing reserved 013-v2-projects.sql. Task 0 in the master plan must qualify the registry/harness before migration implementation. Existing records and raw SQL bytes are preserved.

## Explicit interface overrides

- Agent lifecycle: `transitionAgent(agentId, expectedRevision, requestedLifecycle, context) -> ModelRevisionResult<AgentLifecycleResult>`. Transitions are active→suspended/stopped/revoked/failed; suspended→active/stopped/revoked; stopped/failed→active only through a fresh authorized run; revoked is terminal. A state row never revokes/renews authority by itself. Store an internal positive revision without changing the existing result contract.
- Agent definitions: persist the candidate alongside proposal identity/digest; lifecycle stays staged/denied/review_required. No deployed/authorized state is inferred.
- Artifacts: `registerArtifact(candidate, context)` consults a trusted read-only artifact-store port that reports observed bytes/digest/size. Reject mismatches and unavailable content. Merely storing claimed metadata cannot qualify an artifact.
- Project completion is rejected unless the canonical goal/evidence reader verifies required current goal criteria. Model metadata cannot declare a goal achieved.

## Task 1: task-plan

**Files:**
- Create: `backend/models/task-plan.model.js`, `backend/tests/models/task-plan.test.js`, `tests/integration/backend-models/task-plan.test.ts`, `backend/modules/control/src/model-repositories/task-plan.ts`.
- Reuse: `packages/contracts/src/plan.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createTaskPlanModel({owner,scope,clock})` with `createPlan`, `getPlan`, `revisePlan`, `listPlans` and the exact master/override argument/result contracts.
- Primary record/contract: `TaskPlan` / `TaskPlanSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: task_plans.
- Relational fields/projection keys: `planId`, `goalId`, `goalRevision`, `revision`, `planDigest`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: reject cycles/duplicate step IDs; goal revision and digest match; parallelism <=8. Source task IDs: V2-T02.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/task-plan.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/task-plan.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM01. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 2: agent-definition

**Files:**
- Create: `backend/models/agent-definition.model.js`, `backend/tests/models/agent-definition.test.js`, `tests/integration/backend-models/agent-definition.test.ts`, `backend/modules/control/src/model-repositories/agent-definition.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/agent-definition.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createAgentDefinitionModel({owner,scope,clock})` with `createProposal`, `getProposal`, `listProposals` and the exact master/override argument/result contracts.
- Primary record/contract: `AgentDefinitionProposal` / `AgentDefinitionProposalSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: agent_definition_proposals.
- Relational fields/projection keys: `proposalId`, `definitionId`, `candidateDigest`, `versionRef`, `policyDecisionRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: definition validation cannot grant/deploy; immutable candidate digest. Source task IDs: V2-T07.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/agent-definition.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/agent-definition.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM01. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 3: agent-lifecycle

**Files:**
- Create: `backend/models/agent-lifecycle.model.js`, `backend/tests/models/agent-lifecycle.test.js`, `tests/integration/backend-models/agent-lifecycle.test.ts`, `backend/modules/control/src/model-repositories/agent-lifecycle.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/agent-lifecycle.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createAgentLifecycleModel({owner,scope,clock})` with `getAgent`, `transitionAgent`, `listAgents` and the exact master/override argument/result contracts.
- Primary record/contract: `AgentLifecycleResult` / `AgentLifecycleResultSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: agent_lifecycle.
- Relational fields/projection keys: `agentId`, `definitionVersionRef`, `owningRunId`, `checkpointRef`, `lifecycle`, `lastTransitionAt`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: reject invalid/stale transitions; stopped/revoked cannot resume without current grant. Source task IDs: V2-T08.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/agent-lifecycle.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/agent-lifecycle.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM01. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 4: project

**Files:**
- Create: `backend/models/project.model.js`, `backend/tests/models/project.test.js`, `tests/integration/backend-models/project.test.ts`, `backend/modules/control/src/model-repositories/project.ts`.
- Reuse: `packages/contracts/src/project.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createProjectModel({owner,scope,clock})` with `createProject`, `getProject`, `reviseProject`, `listProjects` and the exact master/override argument/result contracts.
- Primary record/contract: `ProjectRecord` / `ProjectRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: projects.
- Relational fields/projection keys: `projectId`, `conversationId`, `version`, `status`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: completion requires current required goal verification; preserve canonical version field. Source task IDs: V2-T25.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/project.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/project.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM01. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 5: artifact

**Files:**
- Create: `backend/models/artifact.model.js`, `backend/tests/models/artifact.test.js`, `tests/integration/backend-models/artifact.test.ts`, `backend/modules/control/src/model-repositories/artifact.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/artifact.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createArtifactModel({owner,scope,clock})` with `registerArtifact`, `getArtifact`, `listArtifacts` and the exact master/override argument/result contracts.
- Primary record/contract: `ArtifactCandidate` / `ArtifactCandidateSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: artifact_records.
- Relational fields/projection keys: `artifactId`, `owningConversationId`, `runId`, `sha256`, `mediaType`, `byteSize`, `visibilityScope`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: registered digest matches trusted artifact-store bytes; metadata registration never publishes. Source task IDs: V2-T27.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/artifact.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/artifact.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM01. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 6: agent-version

**Files:**
- Create: `backend/models/agent-version.model.js`, `backend/tests/models/agent-version.test.js`, `tests/integration/backend-models/agent-version.test.ts`, `backend/modules/control/src/model-repositories/agent-version.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/agent-version.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createAgentVersionModel({owner,scope,clock})` with `appendVersion`, `getVersion`, `listVersions` and the exact master/override argument/result contracts.
- Primary record/contract: `AgentVersionManifest` / `AgentVersionManifestSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: agent_versions.
- Relational fields/projection keys: `versionId`, `previousVersionRef`, `compatibilityVersion`, `signerRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: all referenced digests pinned; append never deploys or updates held-out cases. Source task IDs: V2-T37.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/agent-version.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/agent-version.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM01. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Batch acceptance

- [ ] All family tests are discovered and pass with zero required skips.
- [ ] Real persisted rows survive pool close/reconstruction; append-only payloads cannot be replaced; wrong-tenant/unauthorized runtime roles cannot access data.
- [ ] An abort/expiry during a lock wait releases connections and leaves no partial writes.
- [ ] Run affected original owner regressions and master-plan checks. Update only the model-only ledger, never infer complete original/V2 features.
