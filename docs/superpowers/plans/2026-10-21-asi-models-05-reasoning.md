# ASI Models Batch 05: Reasoning and specialist projections

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is a task-detail plan under the master plan; preserve the established native sequential execution method.

**Goal:** Implement and qualify the 10 model/projection families below.

**Architecture:** Focused JavaScript facades consume canonical owner ports. New SQL is confined to permitted SQL owners; projections have no independent writer.

**Tech Stack:** Existing Node/Express/PostgreSQL/pgvector/Zod/TypeScript workspace; no new third-party dependencies.

**Spec:** [Approved model design](../specs/2026-10-21-asi-backend-models-design.md).

## Global Constraints

All constraints, result/page types, scope binding, SQL field-map rules and acceptance checks in the [master plan](2026-10-21-asi-backend-models.md) apply verbatim. Public HTTP schemas/controllers remain later work; current task statuses and product capabilities are unchanged.

## Review Focus

Exercise cross-tenant references, altered idempotent payloads, stale revisions, corrupt persisted identity/digests and unavailable owners. In this batch also cover: 33rd critique finding; third round; fifth comparison candidate; conflicting goal revision; forged/expired score evidence; ineligible worker with best score; browser redirect outside scope; data write profile; coding path traversal; dropped research contradiction; prompt injection with no detector flag; replay attempting side effects; private-provider fallback.

## Interfaces consumed and migration boundary

Core task/goal/plan/artifact records; current telemetry, worker eligibility, privacy routing, recovery and signed audit/checkpoint readers.

Migration target: BM05; files: 022-model-reasoning.sql for persisted reports/task profiles only. Task 0 in the master plan must qualify the registry/harness before migration implementation. Existing records and raw SQL bytes are preserved.

## Explicit interface overrides

- Recovery: `deriveRecoveryPlan(input:RecoveryInput,context) -> RecoveryPlan`. Unknown external effects choose reconcile, not retry. Count prior attempts toward the limit and retain current policy/privacy constraints.
- Worker scores: `getWorkerScore(workerId) -> WorkerScore|null`; `rankEligibleWorkers(query:WorkerRankQuery,context) -> RankedWorker[]`. Query includes requested task type/capabilities and limit1–100; current health/grant/capacity/policy eligibility comes from a trusted live snapshot before ranking. Score records are computed from measured evidence, not caller-authored aggregates.
- Critique, comparison and debate writes store validated reports only. Verify bounded findings/rounds/candidates and matching goal/plan revisions before append. They do not call models or dispatch candidates.
- Specialist profile is a discriminated union with browser/data/coding/research variants from the approved inventory. Canonical Task/TaskResult remains authoritative. Data profiles default readOnly=true and have positive bounded row/byte/time limits; browser profiles pin domain/session/action refs; coding profiles pin baseCommit/assignedPaths/commands; research profiles bound source refs/maxQueries and preserve unknown/conflicting claims.
- Trust labels: `labelInput(input:UntrustedInput) -> TrustLabelledInput`; instructionTrust remains literal untrusted_data even when no detector flag is emitted.
- Replay: `readReplay(input:ReplayQuery) -> ReplayView`; mode is literal read_only, sequence bounds ordered, limit1–100. No replayed dispatch/provider/network/credential calls.
- Routing: `selectApprovedModel(input:ModelRoutingRequest,context) -> ModelRoutingDecision`; eligibility/privacy filtering precedes score evaluation. No qualified candidate returns an explicit null selection; never fall back to a forbidden provider.

## Task 1: critique-report

**Files:**
- Create: `backend/models/critique-report.model.js`, `backend/tests/models/critique-report.test.js`, `tests/integration/backend-models/critique-report.test.ts`, `backend/modules/control/src/model-repositories/critique-report.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/critique-report.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createCritiqueReportModel({owner,scope,clock})` with `appendCritique`, `getCritique`, `listCritiques` and the exact master/override argument/result contracts.
- Primary record/contract: `CritiqueReport` / `CritiqueReportSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: critique_reports.
- Relational fields/projection keys: `reportId`, `goalId`, `goalRevision`, `taskResultRef`, `criticId`, `criticVersion`, `round`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: <=32 findings and <=2 rounds; critic findings do not change approval/policy. Source task IDs: V2-T03.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/critique-report.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/critique-report.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 2: recovery-plan

**Files:**
- Create: `backend/models/recovery-plan.model.js`, `backend/tests/models/recovery-plan.test.js`, `tests/integration/backend-models/recovery-plan.test.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/recovery-plan.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the orchestrator package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createRecoveryPlanModel({owner,scope,clock})` with `deriveRecoveryPlan` and the exact master/override argument/result contracts.
- Primary record/contract: `RecoveryPlan` / `RecoveryPlanSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: none: canonical error/effect/retry projection.
- Relational fields/projection keys: `decision`, `reasonCode`, `approvedAlternativeRefs`, `maxRemainingAttempts`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: unknown external outcome => reconcile; attempts include previous; no privacy relaxation. Source task IDs: V2-T15.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/recovery-plan.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. This is read-only: do not add a table or fake persistence.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/recovery-plan.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 3: worker-score

**Files:**
- Create: `backend/models/worker-score.model.js`, `backend/tests/models/worker-score.test.js`, `tests/integration/backend-models/worker-score.test.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/worker-score.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the specialists package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createWorkerScoreModel({owner,scope,clock})` with `getWorkerScore`, `rankEligibleWorkers` and the exact master/override argument/result contracts.
- Primary record/contract: `WorkerScore` / `WorkerScoreSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: none: versioned telemetry/worker evidence projection.
- Relational fields/projection keys: `workerId`, `metricVersion`, `sampleCount`, `evidenceRefs`, `measuredAt`, `validUntil`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: eligibility before score; reject stale/poisoned samples; deterministic ties. Source task IDs: V2-T16.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/worker-score.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. This is read-only: do not add a table or fake persistence.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/worker-score.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 4: candidate-comparison

**Files:**
- Create: `backend/models/candidate-comparison.model.js`, `backend/tests/models/candidate-comparison.test.js`, `tests/integration/backend-models/candidate-comparison.test.ts`, `backend/modules/control/src/model-repositories/candidate-comparison.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/candidate-comparison.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createCandidateComparisonModel({owner,scope,clock})` with `appendComparison`, `getComparison` and the exact master/override argument/result contracts.
- Primary record/contract: `CandidateComparison` / `CandidateComparisonSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: candidate_comparisons.
- Relational fields/projection keys: `comparisonId`, `goalRef`, `planRef`, `evaluatorVersionRef`, `winnerRef`, `budgetRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: 2..4 candidates; noLiveWrites=true; shared recorded usage <=budget; judge cannot authorize. Source task IDs: V2-T17.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/candidate-comparison.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/candidate-comparison.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 5: debate-report

**Files:**
- Create: `backend/models/debate-report.model.js`, `backend/tests/models/debate-report.test.js`, `tests/integration/backend-models/debate-report.test.ts`, `backend/modules/control/src/model-repositories/debate-report.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/debate-report.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createDebateReportModel({owner,scope,clock})` with `appendDebate`, `getDebate` and the exact master/override argument/result contracts.
- Primary record/contract: `DebateReport` / `DebateReportSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: debate_reports.
- Relational fields/projection keys: `debateId`, `proposalVersionRef`, `budgetRef`, `rounds`, `usage`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: 2..4 roles/1..2 rounds; inherited8delegations/12iterations; preserve disagreement/evidence. Source task IDs: V2-T18.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/debate-report.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/debate-report.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 6: specialist-task

**Files:**
- Create: `backend/models/specialist-task.model.js`, `backend/tests/models/specialist-task.test.js`, `tests/integration/backend-models/specialist-task.test.ts`, `backend/modules/control/src/model-repositories/specialist-task.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/specialist-task.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createSpecialistTaskModel({owner,scope,clock})` with `createTaskProfile`, `getTaskProfile`, `listTaskProfiles` and the exact master/override argument/result contracts.
- Primary record/contract: `SpecialistTaskProfile` / `SpecialistTaskProfileSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: specialist_task_profiles; reuse canonical Task/TaskResult.
- Relational fields/projection keys: `taskId`, `profileType`, `goalRef`, `profileDigest`, `deadlineAt`, `version`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: browser/domain; data readOnly+row/byte/time; coding assignedPaths/baseCommit; research maxQueries/source bounds. Source task IDs: V2-T28, V2-T29, V2-T30, V2-T31.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/specialist-task.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/specialist-task.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 7: security-alert

**Files:**
- Create: `backend/models/security-alert.model.js`, `backend/tests/models/security-alert.test.js`, `tests/integration/backend-models/security-alert.test.ts`, `backend/modules/control/src/model-repositories/security-alert.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/security-alert.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createSecurityAlertModel({owner,scope,clock})` with `appendAlert`, `getAlert`, `listAlerts` and the exact master/override argument/result contracts.
- Primary record/contract: `SecurityAlert` / `SecurityAlertSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: security_alerts.
- Relational fields/projection keys: `alertId`, `severity`, `observedAt`, `detectorVersion`, `signedReceiptRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: 1..100 safe signals; signed evidence; observation cannot mutate policy or self-grant. Source task IDs: V2-T32.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/security-alert.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/security-alert.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 8: trust-label

**Files:**
- Create: `backend/models/trust-label.model.js`, `backend/tests/models/trust-label.test.js`, `tests/integration/backend-models/trust-label.test.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/trust-label.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the context package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createTrustLabelModel({owner,scope,clock})` with `labelInput` and the exact master/override argument/result contracts.
- Primary record/contract: `TrustLabelledInput` / `TrustLabelledInputSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: none: input trust projection.
- Relational fields/projection keys: `inputRef`, `origin`, `observedDigest`, `instructionTrust`, `flags`, `quarantineRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: instructionTrust always untrusted_data; detector misses never raise authority. Source task IDs: V2-T33.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/trust-label.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. This is read-only: do not add a table or fake persistence.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/trust-label.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 9: replay-view

**Files:**
- Create: `backend/models/replay-view.model.js`, `backend/tests/models/replay-view.test.js`, `tests/integration/backend-models/replay-view.test.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/replay-view.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createReplayViewModel({owner,scope,clock})` with `readReplay` and the exact master/override argument/result contracts.
- Primary record/contract: `ReplayView` / `ReplayViewSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: none: checkpoints/episodes/effect results read projection.
- Relational fields/projection keys: `runId`, `fromSequence`, `toSequence`, `limit`, `mode`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: read_only and1..100; ordered recorded refs; zero replayed external effects. Source task IDs: V2-T35.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/replay-view.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. This is read-only: do not add a table or fake persistence.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/replay-view.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 10: model-routing

**Files:**
- Create: `backend/models/model-routing.model.js`, `backend/tests/models/model-routing.test.js`, `tests/integration/backend-models/model-routing.test.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/model-routing.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the privacy package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createModelRoutingModel({owner,scope,clock})` with `selectApprovedModel` and the exact master/override argument/result contracts.
- Primary record/contract: `ModelRoutingDecision` / `ModelRoutingDecisionSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: none: policy/metric projection.
- Relational fields/projection keys: `selectedModelRef`, `privacyEligibility`, `scoreBasis`, `policyDecisionRef`, `budgetReservationRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: privacy before scoring; no forbidden fallback; null selection permitted. Source task IDs: V2-T39.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/model-routing.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. This is read-only: do not add a table or fake persistence.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/model-routing.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM05. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Batch acceptance

- [ ] All family tests are discovered and pass with zero required skips.
- [ ] Real persisted rows survive pool close/reconstruction; append-only payloads cannot be replaced; wrong-tenant/unauthorized runtime roles cannot access data.
- [ ] An abort/expiry during a lock wait releases connections and leaves no partial writes.
- [ ] Run affected original owner regressions and master-plan checks. Update only the model-only ledger, never infer complete original/V2 features.
