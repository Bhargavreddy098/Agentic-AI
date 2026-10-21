# ASI Models Batch 02: Governance and credential metadata

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is a task-detail plan under the master plan; preserve the established native sequential execution method.

**Goal:** Implement and qualify the 7 model/projection families below.

**Architecture:** Focused JavaScript facades consume canonical owner ports. New SQL is confined to permitted SQL owners; projections have no independent writer.

**Tech Stack:** Existing Node/Express/PostgreSQL/pgvector/Zod/TypeScript workspace; no new third-party dependencies.

**Spec:** [Approved model design](../specs/2026-10-21-asi-backend-models-design.md).

## Global Constraints

All constraints, result/page types, scope binding, SQL field-map rules and acceptance checks in the [master plan](2026-10-21-asi-backend-models.md) apply verbatim. Public HTTP schemas/controllers remain later work; current task statuses and product capabilities are unchanged.

## Review Focus

Exercise cross-tenant references, altered idempotent payloads, stale revisions, corrupt persisted identity/digests and unavailable owners. In this batch also cover: repeated same-actor approval; expired quorum at lock acquisition; changed input/artifact hash; grant scope widening; revoked parent; integer overflow; allocation attempting to exceed parent quota; tampered audit hash; credentials/chain-of-thought absent from outputs/logs.

## Interfaces consumed and migration boundary

Current identity PostgresGrantStore/delegation/verifier, PolicyService approvals, atomic budget service and signed audit receipt reader. Metadata stores do not mint authority.

Migration target: BM02; files: 018-model-governance.sql. Task 0 in the master plan must qualify the registry/harness before migration implementation. Existing records and raw SQL bytes are preserved.

## Explicit interface overrides

- Quorum record: `ApprovalQuorumRecord={quorumId,request:ApprovalQuorumRequest,revision,decision:ApprovalQuorumDecision}`. `recordDecision(quorumId, actorDecision, expectedRevision, context)` verifies actor identity through the trusted policy owner; the browser never supplies replacement effect arguments. The request's required actor-role references consume existing governance identities and do not create a user RBAC subsystem. `readDecision(quorumId) -> ApprovalQuorumDecision`.
- Grants: `requestGrant(request:ResourceGrantRequest, context)` calls the current identity/policy owner and returns its verified decision; it does not insert a fabricated signed grant. `getGrant(id) -> import('@asi/identity').Grant|null`; `revokeGrant(id, reason, context) -> boolean` delegates current identity revocation. Request-contract validation is separate from the existing canonical GrantSchema.
- Budgets: `readBudget(ref) -> BudgetSnapshot`; `proposeAllocation(request:BudgetAllocationRequest, context) -> BudgetAllocationPlan`; `getAllocation(id) -> BudgetAllocationPlan|null`. Allocations are advisory records until actual atomic reservations succeed; never decrement balance with model SQL.
- Credential bindings: store only opaque handle/effect/target/expiry/revocation metadata with a trusted identity-owned writer. `getBinding(id) -> CredentialResolution|null`; `expireBinding(id,context)` and `revokeBinding(id,reason,context)` return an explicit changed/already_inactive result. No password, signing key, connection string or plaintext resolution method exists on this model. A missing real broker remains unavailable.
- Decision summaries: `getDecisionSummary(receiptId) -> DecisionSummary|null`; list returns safe verified summaries. Verify tenant/principal and receipt integrity before redaction and projection.

## Task 1: approval-quorum

**Files:**
- Create: `backend/models/approval-quorum.model.js`, `backend/tests/models/approval-quorum.test.js`, `tests/integration/backend-models/approval-quorum.test.ts`, `backend/modules/policy/src/model-repositories/approval-quorum.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/approval-quorum.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the policy package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createApprovalQuorumModel({owner,scope,clock})` with `createQuorum`, `getQuorum`, `recordDecision`, `readDecision` and the exact master/override argument/result contracts.
- Primary record/contract: `ApprovalQuorumRequest` / `ApprovalQuorumRequestSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: approval_quorums + approval_quorum_decisions.
- Relational fields/projection keys: `quorumId`, `effectRef`, `inputHash`, `policyVersion`, `proposalVersion`, `expiresAt`, `nonceRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: authenticated actors distinct; exact binding and expiry; changed proposal invalidates old decisions. Source task IDs: V2-T11.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/approval-quorum.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/approval-quorum.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM02. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 2: resource-grant

**Files:**
- Create: `backend/models/resource-grant.model.js`, `backend/tests/models/resource-grant.test.js`, `tests/integration/backend-models/resource-grant.test.ts`, `backend/modules/identity/src/model-repositories/resource-grant.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/resource-grant.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the identity package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createResourceGrantModel({owner,scope,clock})` with `requestGrant`, `getGrant`, `revokeGrant` and the exact master/override argument/result contracts.
- Primary record/contract: `ResourceGrantRequest` / `ResourceGrantRequestSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: reuse identity_grants through PostgresGrantStore and current identity issuer.
- Relational fields/projection keys: `grantId`, `tenantId`, `parentGrantId`, `audience`, `capabilities`, `expiresAt`, `revokedAt`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: use existing issuance/verifier; child subset and audience; no signing key on model object. Source task IDs: V2-T12.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/resource-grant.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/resource-grant.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM02. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 3: action-preview

**Files:**
- Create: `backend/models/action-preview.model.js`, `backend/tests/models/action-preview.test.js`, `tests/integration/backend-models/action-preview.test.ts`, `backend/modules/control/src/model-repositories/action-preview.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/action-preview.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createActionPreviewModel({owner,scope,clock})` with `appendPreview`, `getPreview`, `listPreviews` and the exact master/override argument/result contracts.
- Primary record/contract: `ActionPreview` / `ActionPreviewSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: action_previews.
- Relational fields/projection keys: `previewId`, `effectId`, `inputHash`, `artifactHash`, `version`, `expiresAt`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: no effects during model writes; executable approval requires exact current input/artifact digest. Source task IDs: V2-T13.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/action-preview.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/action-preview.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM02. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 4: compensation-plan

**Files:**
- Create: `backend/models/compensation-plan.model.js`, `backend/tests/models/compensation-plan.test.js`, `tests/integration/backend-models/compensation-plan.test.ts`, `backend/modules/control/src/model-repositories/compensation-plan.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/compensation-plan.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createCompensationPlanModel({owner,scope,clock})` with `appendCompensationPlan`, `getCompensationPlan` and the exact master/override argument/result contracts.
- Primary record/contract: `CompensationPlan` / `CompensationPlanSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: compensation_plans.
- Relational fields/projection keys: `planId`, `originalReceiptRef`, `expectedStateDigest`, `requiredApprovalRef`, `boundedDeadline`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: unknown/irreversible effects not silently undone; plan never dispatches compensation. Source task IDs: V2-T14.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/compensation-plan.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/compensation-plan.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM02. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 5: budget-allocation

**Files:**
- Create: `backend/models/budget-allocation.model.js`, `backend/tests/models/budget-allocation.test.js`, `tests/integration/backend-models/budget-allocation.test.ts`, `backend/modules/budgets/src/model-repositories/budget-allocation.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/budget-allocation.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the budgets package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createBudgetAllocationModel({owner,scope,clock})` with `readBudget`, `proposeAllocation`, `getAllocation` and the exact master/override argument/result contracts.
- Primary record/contract: `BudgetAllocationPlan` / `BudgetAllocationPlanSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: budget_allocation_plans; reuse budget_accounts/budget_reservations.
- Relational fields/projection keys: `allocationId`, `budgetRef`, `version`, `totalReserved`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: plan is advisory until atomic owner reservations; concurrent spend cannot exceed quota; integer overflow rejected. Source task IDs: V2-T19.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/budget-allocation.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/budget-allocation.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM02. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 6: credential-binding

**Files:**
- Create: `backend/models/credential-binding.model.js`, `backend/tests/models/credential-binding.test.js`, `tests/integration/backend-models/credential-binding.test.ts`, `backend/modules/identity/src/model-repositories/credential-binding.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/credential-binding.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the identity package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createCredentialBindingModel({owner,scope,clock})` with `getBinding`, `expireBinding`, `revokeBinding` and the exact master/override argument/result contracts.
- Primary record/contract: `CredentialResolution` / `CredentialResolutionSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: credential_binding_metadata: opaque handles and target bindings only; no credential material.
- Relational fields/projection keys: `bindingId`, `handleId`, `verifiedEffectRef`, `allowedTargetDigest`, `expiresAt`, `revokedAt`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: only opaque execution binding; forged target/expired/revoked handles rejected; no secret resolution in HTTP model. Source task IDs: V2-T24.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/credential-binding.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/credential-binding.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM02. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 7: decision-summary

**Files:**
- Create: `backend/models/decision-summary.model.js`, `backend/tests/models/decision-summary.test.js`, `tests/integration/backend-models/decision-summary.test.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/decision-summary.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the audit package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createDecisionSummaryModel({owner,scope,clock})` with `getDecisionSummary`, `listDecisionSummaries` and the exact master/override argument/result contracts.
- Primary record/contract: `DecisionSummary` / `DecisionSummarySchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: none: projection of audit receipts.
- Relational fields/projection keys: `decisionId`, `receiptRef`, `receiptHash`, `policyVersion`, `occurredAt`, `redactionVersion`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: verify receipt/hash and principal filter before safe projection; no raw prompt/chain of thought. Source task IDs: V2-T34.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/decision-summary.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. This is read-only: do not add a table or fake persistence.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/decision-summary.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM02. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Batch acceptance

- [ ] All family tests are discovered and pass with zero required skips.
- [ ] Real persisted rows survive pool close/reconstruction; append-only payloads cannot be replaced; wrong-tenant/unauthorized runtime roles cannot access data.
- [ ] An abort/expiry during a lock wait releases connections and leaves no partial writes.
- [ ] Run affected original owner regressions and master-plan checks. Update only the model-only ledger, never infer complete original/V2 features.
