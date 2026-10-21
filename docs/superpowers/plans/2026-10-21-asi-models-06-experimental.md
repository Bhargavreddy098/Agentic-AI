# ASI Models Batch 06: Workspace and experimental/release metadata

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is a task-detail plan under the master plan; preserve the established native sequential execution method.

**Goal:** Implement and qualify the 7 model/projection families below.

**Architecture:** Focused JavaScript facades consume canonical owner ports. New SQL is confined to permitted SQL owners; projections have no independent writer.

**Tech Stack:** Existing Node/Express/PostgreSQL/pgvector/Zod/TypeScript workspace; no new third-party dependencies.

**Spec:** [Approved model design](../specs/2026-10-21-asi-backend-models-design.md).

## Global Constraints

All constraints, result/page types, scope binding, SQL field-map rules and acceptance checks in the [master plan](2026-10-21-asi-backend-models.md) apply verbatim. Public HTTP schemas/controllers remain later work; current task statuses and product capabilities are unchanged.

## Review Focus

Exercise cross-tenant references, altered idempotent payloads, stale revisions, corrupt persisted identity/digests and unavailable owners. In this batch also cover: symlink/root profile mismatch; cleanup reported with missing receipt; candidate modifies protected eval refs; changed immutable candidate digest; simulation claims noLiveEffects=false; forged release eligibility; restore evidence for wrong backup; depth3/fanout9; child grant widening; zero host filesystem/deploy/network effects.

## Interfaces consumed and migration boundary

Core immutable version/artifact metadata, independent evaluation/receipt refs, current budget/grant bindings and trusted workspace profile verification. No sandbox provisioning, model spending or release action is performed.

Migration target: BM06; files: 023-model-experimental.sql. Task 0 in the master plan must qualify the registry/harness before migration implementation. Existing records and raw SQL bytes are preserved.

## Explicit interface overrides

- Workspace leases: `recordLease(lease:WorkspaceLease,context)` requires a trusted sandbox-owner validation receipt for the opaque root/profile digest. `expireLease(id,expectedRevision,context)` and `recordCleanup(id,expectedRevision,cleanupEvidenceRef,context)` return ModelRevisionResult<WorkspaceLease>. The model cannot claim deletion/cleanup without matching trusted evidence or touch arbitrary host paths.
- Tool/scaffold candidates preserve immutable content digests, base/version lineage, assigned path refs, requested capabilities and independent evaluation refs. Stored reviewState is draft/review_required/denied; no self-approved/promoted state is accepted.
- Simulation writes include candidate/input/eval/environment digests, fixed budget ref, per-scenario metric/evidence refs and limitations. noLiveEffects is literal true in the request provenance; reports cannot claim a live test from a fixture.
- Agent release metadata stores the requested candidate/gate/environment/approval refs and independent evidence-backed eligible/denied result. `appendReleaseEvaluation(report,context)` never deploys or updates rollout pointers.
- Restore report record binds backup artifact/digest, source and disposable target environment refs, retention-policy ref, performedAt, verification refs, observed failure/limitation states and safe summary. `appendRestoreReport` only records evidence; there is no restore/delete command on the model.
- Swarm metadata binds goal/plan/version/allocation/shared budget and reduced grant requests. Validate requestedDepth<=2 and requestedFanOut<=8; no runtime hierarchy is spawned by storing it.

## Task 1: restore-report

**Files:**
- Create: `backend/models/restore-report.model.js`, `backend/tests/models/restore-report.test.js`, `tests/integration/backend-models/restore-report.test.ts`, `backend/modules/control/src/model-repositories/restore-report.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/restore-report.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createRestoreReportModel({owner,scope,clock})` with `appendRestoreReport`, `getRestoreReport` and the exact master/override argument/result contracts.
- Primary record/contract: `RestoreReport` / `RestoreReportSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: restore_reports.
- Relational fields/projection keys: `restoreId`, `backupArtifactRef`, `backupDigest`, `targetEnvironmentRef`, `retentionPolicyRef`, `verificationRefs`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: report never restores/deletes data; restore evidence includes actual validation and limitations. Source task IDs: 25.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/restore-report.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/restore-report.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM06. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 2: tool-candidate

**Files:**
- Create: `backend/models/tool-candidate.model.js`, `backend/tests/models/tool-candidate.test.js`, `tests/integration/backend-models/tool-candidate.test.ts`, `backend/modules/control/src/model-repositories/tool-candidate.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/tool-candidate.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createToolCandidateModel({owner,scope,clock})` with `appendCandidate`, `getCandidate`, `listCandidates` and the exact master/override argument/result contracts.
- Primary record/contract: `ToolCandidateRecord` / `ToolCandidateRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: tool_candidates.
- Relational fields/projection keys: `candidateId`, `manifestDigest`, `artifactDigest`, `evalReportRefs`, `versionRef`, `reviewState`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: candidate cannot edit protected evals/sign/promote itself; data storage only. Source task IDs: 27.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/tool-candidate.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/tool-candidate.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM06. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 3: scaffold-candidate

**Files:**
- Create: `backend/models/scaffold-candidate.model.js`, `backend/tests/models/scaffold-candidate.test.js`, `tests/integration/backend-models/scaffold-candidate.test.ts`, `backend/modules/control/src/model-repositories/scaffold-candidate.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/scaffold-candidate.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createScaffoldCandidateModel({owner,scope,clock})` with `appendCandidate`, `getCandidate`, `listCandidates` and the exact master/override argument/result contracts.
- Primary record/contract: `ScaffoldCandidateRecord` / `ScaffoldCandidateRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: scaffold_candidates.
- Relational fields/projection keys: `candidateId`, `baseVersionRef`, `candidateDigest`, `assignedPathRefs`, `evalReportRefs`, `reviewState`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: protected paths denied; existing working files not touched; promotion separate. Source task IDs: 29.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/scaffold-candidate.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/scaffold-candidate.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM06. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 4: workspace-lease

**Files:**
- Create: `backend/models/workspace-lease.model.js`, `backend/tests/models/workspace-lease.test.js`, `tests/integration/backend-models/workspace-lease.test.ts`, `backend/modules/control/src/model-repositories/workspace-lease.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/workspace-lease.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createWorkspaceLeaseModel({owner,scope,clock})` with `recordLease`, `getLease`, `expireLease`, `recordCleanup` and the exact master/override argument/result contracts.
- Primary record/contract: `WorkspaceLease` / `WorkspaceLeaseSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: workspace_leases.
- Relational fields/projection keys: `leaseId`, `workspaceId`, `rootRef`, `profileDigest`, `expiresAt`, `cleanupState`, `version`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: opaque canonical root; no escape/symlink widening; model cannot provision host filesystem. Source task IDs: V2-T26.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/workspace-lease.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/workspace-lease.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM06. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 5: simulation-report

**Files:**
- Create: `backend/models/simulation-report.model.js`, `backend/tests/models/simulation-report.test.js`, `tests/integration/backend-models/simulation-report.test.ts`, `backend/modules/control/src/model-repositories/simulation-report.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/simulation-report.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createSimulationReportModel({owner,scope,clock})` with `appendSimulation`, `getSimulation` and the exact master/override argument/result contracts.
- Primary record/contract: `SimulationReport` / `SimulationReportSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: simulation_reports.
- Relational fields/projection keys: `simulationId`, `candidateVersionRef`, `scenarioSetRef`, `heldOutVersionRef`, `environmentDigest`, `fixedBudgetRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: noLiveEffects=true; pinned inputs/evaluation/candidate; no real account effects. Source task IDs: V2-T36.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/simulation-report.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/simulation-report.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM06. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 6: agent-release

**Files:**
- Create: `backend/models/agent-release.model.js`, `backend/tests/models/agent-release.test.js`, `tests/integration/backend-models/agent-release.test.ts`, `backend/modules/control/src/model-repositories/agent-release.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/agent-release.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createAgentReleaseModel({owner,scope,clock})` with `appendReleaseEvaluation`, `getReleaseEvaluation` and the exact master/override argument/result contracts.
- Primary record/contract: `AgentReleaseReport` / `AgentReleaseReportSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: agent_release_reports.
- Relational fields/projection keys: `releaseId`, `candidateManifestRef`, `protectedBaselineDigest`, `gateVersion`, `targetEnvironmentRef`, `promotionApprovalRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: eligible/denied is evidence evaluation only; no deployment/promotion mutation. Source task IDs: V2-T38.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/agent-release.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/agent-release.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM06. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 7: swarm-plan

**Files:**
- Create: `backend/models/swarm-plan.model.js`, `backend/tests/models/swarm-plan.test.js`, `tests/integration/backend-models/swarm-plan.test.ts`, `backend/modules/control/src/model-repositories/swarm-plan.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/swarm-plan.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createSwarmPlanModel({owner,scope,clock})` with `appendSwarmPlan`, `getSwarmPlan` and the exact master/override argument/result contracts.
- Primary record/contract: `SwarmPlan` / `SwarmPlanSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: swarm_plans.
- Relational fields/projection keys: `swarmPlanId`, `goalRef`, `planRef`, `reviewedAllocationRef`, `sharedBudgetRef`, `requestedDepth`, `requestedFanOut`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: depth<=2/fanOut<=8; reduced grants; data model never dispatches swarm. Source task IDs: V2-T40.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/swarm-plan.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/swarm-plan.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM06. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Batch acceptance

- [ ] All family tests are discovered and pass with zero required skips.
- [ ] Real persisted rows survive pool close/reconstruction; append-only payloads cannot be replaced; wrong-tenant/unauthorized runtime roles cannot access data.
- [ ] An abort/expiry during a lock wait releases connections and leaves no partial writes.
- [ ] Run affected original owner regressions and master-plan checks. Update only the model-only ledger, never infer complete original/V2 features.
