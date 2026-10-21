# ASI Models Batch 03: Skills, context and scoped memory

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is a task-detail plan under the master plan; preserve the established native sequential execution method.

**Goal:** Implement and qualify the 7 model/projection families below.

**Architecture:** Focused JavaScript facades consume canonical owner ports. New SQL is confined to permitted SQL owners; projections have no independent writer.

**Tech Stack:** Existing Node/Express/PostgreSQL/pgvector/Zod/TypeScript workspace; no new third-party dependencies.

**Spec:** [Approved model design](../specs/2026-10-21-asi-backend-models-design.md).

## Global Constraints

All constraints, result/page types, scope binding, SQL field-map rules and acceptance checks in the [master plan](2026-10-21-asi-backend-models.md) apply verbatim. Public HTTP schemas/controllers remain later work; current task statuses and product capabilities are unchanged.

## Review Focus

Exercise cross-tenant references, altered idempotent payloads, stale revisions, corrupt persisted identity/digests and unavailable owners. In this batch also cover: cross-tenant graph hop; private fact reachable through a public relation; role mismatch; expired branch ancestor; circular ancestry; stale memory revision; confidence NaN/out of range; revoked/unsigned skill; token overflow; dropped complete tool group; duplicate candidate digest with changed source versions.

## Interfaces consumed and migration boundary

Existing skill version/install/trust store, memory broker query/publish/revision ports, scoped observations schema, context compiler and canonical memory/principal contracts.

Migration target: BM03; files: 019-model-memory.sql, 020-observation-bootstrap.sql and the reserved 012-v2-memory-lifecycle.sql. Task 0 in the master plan must qualify the registry/harness before migration implementation. Existing records and raw SQL bytes are preserved.

## Explicit interface overrides

- Skill model: `listSkills(query) -> ModelPage<SkillCatalogEntry>`; `getSkill(id) -> SkillCatalogEntry|null`; `proposeInstall(input:SkillInstallRequest,context) -> SkillInstallProposal`; `getInstallProposal(id) -> SkillInstallProposal|null`. Safe catalog entries contain immutable manifest metadata/digest/provenance, not executable marketplace payloads. Installation/verification/revocation continue through existing owners.
- Selection: `selectQualifiedSkills(input:SkillSelectionRequest,context) -> QualifiedSkillSelection`. Context: `compileContextBundle(input:ContextCompileRequest,context) -> ContextBundle`. Both use current owner ports and return evidence/omission reasons; the model does not make direct inference calls.
- Lifecycle: `getMemory(id) -> MemoryRecord|null`; `reviseMemoryLifecycle(input:MemoryLifecycleRevision,expectedRevision,context) -> ModelRevisionResult<MemoryRecord>`; `listRevisions({memoryId,limit,cursor})`. Keep canonical memory value/version and declared confidence basis.
- Graph: reuse `ObservationSchema` from existing memory contracts. Persist an internal `ObservationRecord={observationId,observation:Observation,scopeBinding:{roleId?,ownerAgentId?}}` with trusted scope bindings satisfying the existing Global/Role/Private SQL consistency rules. The canonical `ownerId` field is preserved and is not substituted for trusted visibility context; a forged payload owner cannot widen access. `queryGraph(query:GraphQuery) -> GraphResult` performs scoped PostgreSQL traversal at each hop, with depth1–2 and limit1–100. `reviseObservation(observation,expectedRevision,context)` keeps immutable provenance history.
- Branch record: branchId, tenant, parentBranchId?, positive version, current grant refs, permitted visibility scope, createdAt/expiresAt. `queryBranch(query:MemoryBranchQuery) -> MemoryBranchResult`; ancestry must have matching tenant, current grants and nonwidening visibility at every hop.
- Consolidation uses the existing ConsolidationPlan and records immutable candidate identity/digest/source versions/evaluation refs; publication remains a separate owner-authorized CAS operation.

## Task 1: skill

**Files:**
- Create: `backend/models/skill.model.js`, `backend/tests/models/skill.test.js`, `tests/integration/backend-models/skill.test.ts`, `backend/modules/skills/src/model-repositories/skill.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/skill.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the skills package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createSkillModel({owner,scope,clock})` with `listSkills`, `getSkill`, `proposeInstall`, `getInstallProposal` and the exact master/override argument/result contracts.
- Primary record/contract: `SkillInstallProposal` / `SkillInstallProposalSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: reuse skill_versions/skill_installs/skill_trust_records; add skill_install_proposals.
- Relational fields/projection keys: `proposalId`, `skillId`, `version`, `publisherId`, `manifestDigest`, `expectedCatalogRevision`, `reviewState`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: signed+revoked+tenant checks; proposal does not install/execute; catalog limit <=100. Source task IDs: 18, V2-T05.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/skill.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/skill.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM03. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 2: consolidation-candidate

**Files:**
- Create: `backend/models/consolidation-candidate.model.js`, `backend/tests/models/consolidation-candidate.test.js`, `tests/integration/backend-models/consolidation-candidate.test.ts`, `backend/modules/memory/src/model-repositories/consolidation-candidate.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/consolidation-candidate.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the memory package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createConsolidationCandidateModel({owner,scope,clock})` with `appendCandidate`, `getCandidate`, `listCandidates` and the exact master/override argument/result contracts.
- Primary record/contract: `ConsolidationCandidate` / `ConsolidationCandidateSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: consolidation_candidates.
- Relational fields/projection keys: `candidateId`, `sourceMemoryRefs`, `sourceEpisodeRefs`, `candidateDigest`, `evalReportRef`, `expectedMemoryVersions`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: candidate is not a published fact; provenance/scope preserved; CAS checked at later publication. Source task IDs: 26.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/consolidation-candidate.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/consolidation-candidate.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM03. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 3: observation

**Files:**
- Create: `backend/models/observation.model.js`, `backend/tests/models/observation.test.js`, `tests/integration/backend-models/observation.test.ts`, `backend/modules/memory/src/model-repositories/observation.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/observation.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the memory package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createObservationModel({owner,scope,clock})` with `getObservation`, `reviseObservation`, `queryGraph`, `listObservations` and the exact master/override argument/result contracts.
- Primary record/contract: `Observation` / `ObservationSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: reuse observations/observation_revisions/observation_exchange.
- Relational fields/projection keys: `observationId`, `entity`, `relation`, `value`, `scope`, `roleId`, `ownerAgentId`, `revision`, `validUntil`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: depth1..2/limit1..100; filter every graph hop and scope inheritance; reject cycles beyond depth. Source task IDs: 28, V2-T22.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/observation.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/observation.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM03. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 4: skill-selection

**Files:**
- Create: `backend/models/skill-selection.model.js`, `backend/tests/models/skill-selection.test.js`, `tests/integration/backend-models/skill-selection.test.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/skill-selection.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the skills package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createSkillSelectionModel({owner,scope,clock})` with `selectQualifiedSkills` and the exact master/override argument/result contracts.
- Primary record/contract: `QualifiedSkillSelection` / `QualifiedSkillSelectionSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: none: deterministic selection projection.
- Relational fields/projection keys: `skill version/digest refs`, `omitted reasons`, `tokenCount`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: verified/nonrevoked/currently authorized filtering before ranking and token budget. Source task IDs: V2-T06.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/skill-selection.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. This is read-only: do not add a table or fake persistence.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/skill-selection.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM03. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 5: context-bundle

**Files:**
- Create: `backend/models/context-bundle.model.js`, `backend/tests/models/context-bundle.test.js`, `tests/integration/backend-models/context-bundle.test.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/context-bundle.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the context package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createContextBundleModel({owner,scope,clock})` with `compileContextBundle` and the exact master/override argument/result contracts.
- Primary record/contract: `ContextBundle` / `ContextBundleSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: none: compiled artifact reference projection.
- Relational fields/projection keys: `ordered source refs`, `compiledArtifactRef`, `prefixHash`, `tokenCount`, `trustLabels`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: preserve complete tool groups/stable prefix; reject unauthorized source; exact token bound. Source task IDs: V2-T20.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/context-bundle.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. This is read-only: do not add a table or fake persistence.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/context-bundle.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM03. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 6: memory-lifecycle

**Files:**
- Create: `backend/models/memory-lifecycle.model.js`, `backend/tests/models/memory-lifecycle.test.js`, `tests/integration/backend-models/memory-lifecycle.test.ts`, `backend/modules/memory/src/model-repositories/memory-lifecycle.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/memory-lifecycle.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the memory package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createMemoryLifecycleModel({owner,scope,clock})` with `getMemory`, `reviseMemoryLifecycle`, `listRevisions` and the exact master/override argument/result contracts.
- Primary record/contract: `MemoryLifecycleRevision` / `MemoryLifecycleRevisionSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: existing memory_records/memory_revisions; reserved 012-v2-memory-lifecycle.sql.
- Relational fields/projection keys: `memoryId`, `expectedMemoryVersion`, `sourceRefs`, `confidenceBasis`, `verifiedAt`, `expiresAt`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: CAS; preserve numeric confidence; expired facts cannot outrank correction; role/private visibility. Source task IDs: V2-T21.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/memory-lifecycle.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/memory-lifecycle.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM03. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 7: memory-branch

**Files:**
- Create: `backend/models/memory-branch.model.js`, `backend/tests/models/memory-branch.test.js`, `tests/integration/backend-models/memory-branch.test.ts`, `backend/modules/memory/src/model-repositories/memory-branch.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/memory-branch.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the memory package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createMemoryBranchModel({owner,scope,clock})` with `createBranch`, `getBranch`, `reviseBranch`, `queryBranch` and the exact master/override argument/result contracts.
- Primary record/contract: `MemoryBranchRecord` / `MemoryBranchRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: memory_branches + memory_branch_members.
- Relational fields/projection keys: `branchId`, `parentBranchId`, `version`, `expiresAt`, `grantRefs`, `visibilityScope`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: same-tenant ancestry; deny audience widening/cycles/expired ancestry; no Private-to-Global copy. Source task IDs: V2-T23.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/memory-branch.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/memory-branch.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM03. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Batch acceptance

- [ ] All family tests are discovered and pass with zero required skips.
- [ ] Real persisted rows survive pool close/reconstruction; append-only payloads cannot be replaced; wrong-tenant/unauthorized runtime roles cannot access data.
- [ ] An abort/expiry during a lock wait releases connections and leaves no partial writes.
- [ ] Run affected original owner regressions and master-plan checks. Update only the model-only ledger, never infer complete original/V2 features.
