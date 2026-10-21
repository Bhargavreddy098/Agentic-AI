# ASI Models Batch 04: Triggers, schedules, channels and protocol metadata

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is a task-detail plan under the master plan; preserve the established native sequential execution method.

**Goal:** Implement and qualify the 6 model/projection families below.

**Architecture:** Focused JavaScript facades consume canonical owner ports. New SQL is confined to permitted SQL owners; projections have no independent writer.

**Tech Stack:** Existing Node/Express/PostgreSQL/pgvector/Zod/TypeScript workspace; no new third-party dependencies.

**Spec:** [Approved model design](../specs/2026-10-21-asi-backend-models-design.md).

## Global Constraints

All constraints, result/page types, scope binding, SQL field-map rules and acceptance checks in the [master plan](2026-10-21-asi-backend-models.md) apply verbatim. Public HTTP schemas/controllers remain later work; current task statuses and product capabilities are unchanged.

## Review Focus

Exercise cross-tenant references, altered idempotent payloads, stale revisions, corrupt persisted identity/digests and unavailable owners. In this batch also cover: duplicate external ID with changed digest; forged tenant/signature evidence; disabled credential binding; DST gap/overlap; invalid timezone; arbitrary code in schedule expression; remote terminal resurrection; expired fleet deadline; duplicate active assignment; zero network-delivery calls.

## Interfaces consumed and migration boundary

Current ingress deduplication, delivery outbox, heartbeat scheduling, MCP metadata and checked A2A task-state mapping. No live Slack/Discord/WhatsApp/remote tool connection is required for metadata tests.

Migration target: BM04; files: 021-model-channels.sql. Task 0 in the master plan must qualify the registry/harness before migration implementation. Existing records and raw SQL bytes are preserved.

## Explicit interface overrides

- Triggers: `acceptTrigger(event:TriggerEvent,context) -> TriggerAcceptance` consumes trusted signature-verification evidence, derives tenant from bound scope and preserves existing tenant/source/externalEventId/digest idempotency. `getTriggerAcceptance(id)` reads the acceptance record.
- Schedules: `createSchedule(spec:ScheduleSpec,context) -> ModelCreateResult<ScheduleRecord>`; `reviseSchedule(spec,expectedVersion,context) -> ModelRevisionResult<ScheduleRecord>`; `disableSchedule(id,expectedVersion,context) -> ModelRevisionResult<ScheduleRecord>`. Persist deterministic scheduling metadata only; calling these model methods does not run jobs. Test configured timezone and DST policy with an injected clock.
- Channel binding schema includes bindingId/tenant/channelType/external account+conversation refs/opaque credentialHandleRef/version and active/disabled state. `bindChannel(record,context)` cannot send a message. Delivery reads project existing outbox state and unknown outcomes honestly.
- Protocol connection schema pins connection identity, endpoint reference, protocol revision, capability digest, opaque credential handle, version and expiry. Connection registration is metadata; existing network policy/identity checks remain mandatory when an adapter later connects.
- Remote task transitions: `transitionRemoteTask(id,expectedVersion,nextState,context)` uses existing checked A2A status transitions and current effect journal refs. Repeated identical terminal outcomes are idempotent; terminal-to-running resurrection and changed result digest are rejected.
- Fleet assignments bind tenant/task/version/current grant/budget/deadline with a positive revision. Cancellation is a state request, not proof that a live external worker has stopped.

## Task 1: channel-delivery

**Files:**
- Create: `backend/models/channel-delivery.model.js`, `backend/tests/models/channel-delivery.test.js`, `tests/integration/backend-models/channel-delivery.test.ts`, `backend/modules/control/src/model-repositories/channel-delivery.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/channel-delivery.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createChannelDeliveryModel({owner,scope,clock})` with `getBinding`, `bindChannel`, `getDelivery`, `listDeliveries` and the exact master/override argument/result contracts.
- Primary record/contract: `ChannelBindingRecord` / `ChannelBindingRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: channel_bindings; reuse ingress_events/delivery_outbox.
- Relational fields/projection keys: `bindingId`, `channelType`, `externalAccountRef`, `externalConversationRef`, `credentialHandleRef`, `version`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: forged tenant denied; opaque credentials only; model cannot deliver network messages. Source task IDs: 20.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/channel-delivery.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/channel-delivery.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM04. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 2: protocol-connection

**Files:**
- Create: `backend/models/protocol-connection.model.js`, `backend/tests/models/protocol-connection.test.js`, `tests/integration/backend-models/protocol-connection.test.ts`, `backend/modules/control/src/model-repositories/protocol-connection.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/protocol-connection.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createProtocolConnectionModel({owner,scope,clock})` with `registerConnection`, `getConnection`, `reviseConnection`, `listConnections` and the exact master/override argument/result contracts.
- Primary record/contract: `ProtocolConnectionRecord` / `ProtocolConnectionRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: protocol_connections.
- Relational fields/projection keys: `connectionId`, `protocolRevision`, `endpointRef`, `credentialHandleRef`, `capabilityDigest`, `version`, `expiresAt`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: MCP metadata cannot execute tools; endpoint policy before use; no freeform credentials. Source task IDs: 22.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/protocol-connection.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/protocol-connection.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM04. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 3: remote-task

**Files:**
- Create: `backend/models/remote-task.model.js`, `backend/tests/models/remote-task.test.js`, `tests/integration/backend-models/remote-task.test.ts`, `backend/modules/control/src/model-repositories/remote-task.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/remote-task.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createRemoteTaskModel({owner,scope,clock})` with `createRemoteTask`, `getRemoteTask`, `transitionRemoteTask` and the exact master/override argument/result contracts.
- Primary record/contract: `RemoteTaskRecord` / `RemoteTaskRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: remote_task_bindings.
- Relational fields/projection keys: `remoteTaskId`, `localTaskId`, `remoteAgentRef`, `protocolRevision`, `status`, `version`, `resultDigest`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: use existing A2A checked state mapping; no out-of-order terminal resurrection or duplicate effects. Source task IDs: 23.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/remote-task.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/remote-task.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM04. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 4: fleet-assignment

**Files:**
- Create: `backend/models/fleet-assignment.model.js`, `backend/tests/models/fleet-assignment.test.js`, `tests/integration/backend-models/fleet-assignment.test.ts`, `backend/modules/control/src/model-repositories/fleet-assignment.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/fleet-assignment.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createFleetAssignmentModel({owner,scope,clock})` with `createAssignment`, `getAssignment`, `reviseAssignment`, `listAssignments` and the exact master/override argument/result contracts.
- Primary record/contract: `FleetAssignmentRecord` / `FleetAssignmentRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: fleet_assignments.
- Relational fields/projection keys: `assignmentId`, `taskRef`, `agentVersionRef`, `grantRef`, `budgetRef`, `deadlineAt`, `version`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: one active scoped assignment per task+version; cancelled/expired parent denies reassignment. Source task IDs: 24.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/fleet-assignment.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/fleet-assignment.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM04. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 5: trigger

**Files:**
- Create: `backend/models/trigger.model.js`, `backend/tests/models/trigger.test.js`, `tests/integration/backend-models/trigger.test.ts`, `backend/modules/control/src/model-repositories/trigger.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/trigger.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createTriggerModel({owner,scope,clock})` with `acceptTrigger`, `getTriggerAcceptance` and the exact master/override argument/result contracts.
- Primary record/contract: `TriggerAcceptance` / `TriggerAcceptanceSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: reuse ingress_events; trigger_acceptances if canonical ingress has no required bindings.
- Relational fields/projection keys: `acceptedId`, `sourceId`, `externalEventId`, `observedDigest`, `signatureVerificationRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: trusted tenant only; same external key+digest dedup; altered digest conflict; bound rate/capacity. Source task IDs: V2-T09.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/trigger.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/trigger.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM04. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Task 6: schedule

**Files:**
- Create: `backend/models/schedule.model.js`, `backend/tests/models/schedule.test.js`, `tests/integration/backend-models/schedule.test.ts`, `backend/modules/control/src/model-repositories/schedule.ts`.
- Create/reuse canonical exports in: `packages/contracts/src/backend-models/schedule.ts`; export new contracts through `packages/contracts/src/index.ts` only once.
- Modify: the control package's export index, approved batch migration and `backend/database/model-field-map.json` when the family has persisted state. No SQL changes for projections.

**Interfaces:**
- Produce: `createScheduleModel({owner,scope,clock})` with `createSchedule`, `getSchedule`, `reviseSchedule`, `disableSchedule`, `listSchedules` and the exact master/override argument/result contracts.
- Primary record/contract: `ScheduleRecord` / `ScheduleRecordSchema`. Reuse the canonical existing record when present; the override section identifies methods returning a different record.
- Persistence: reuse heartbeat schedules; add schedule_specs for broader contract.
- Relational fields/projection keys: `scheduleId`, `owningConversationId`, `version`, `timezone`, `nextRunAt`, `enabled`, `budgetRef`, `grantRef`. Add the standard tenant/identity/revision/digest/timestamp columns only for new tables as specified in the master plan.
- Family acceptance: DST/missed-run/overlap policy validated; no arbitrary code; no scheduler execution in model. Source task IDs: V2-T10.

- [ ] **Step 1 — RED:** Write named model tests for valid owner output, unavailable owner, invalid input and this family's explicit acceptance boundaries. For writes, assert identical retry versus altered-payload conflict; for mutable records, assert stale revision rejection. For projections, spy on forbidden effect ports and assert zero calls.
- [ ] **Step 2 — Verify RED:** Build only consumed contract/owner packages, then run `node --test backend/tests/models/schedule.test.js`. Require a behavioral missing-interface/validation failure, not a dependency install or import-resolution failure.
- [ ] **Step 3 — Implement:** Define/reuse strict stored-record schemas; implement the canonical owner repository or projection and explicit model facade. Complete the executable field map with actual columns/FKs/indexes/transitions before writing SQL. Use the reviewed batch migration; validate decoded payload against relational identity/digest and enforce current scoped authority. Do not create a competing writer for the named existing tables.
- [ ] **Step 4 — GREEN:** Run the native model test and `node node_modules/vitest/vitest.mjs run --project integration tests/integration/backend-models/schedule.test.ts --maxWorkers=1`. Persisted families exercise actual PostgreSQL constraints, tenant/runtime-role isolation, rollback and concurrent conflicts. Projection integration consumes seeded canonical owner records and proves no effects. Missing required infrastructure is a reported failed qualification.
- [ ] **Step 5 — Reviewable result:** Run affected contract snapshots/types, owned lint/checkJs and architecture/dependency checks. Record actual evidence under BM04. Commit only this task's explicitly owned changes if safe to separate from the dirty checkout; otherwise retain the reviewed diff and explain the dependency, without staging unrelated work.

## Batch acceptance

- [ ] All family tests are discovered and pass with zero required skips.
- [ ] Real persisted rows survive pool close/reconstruction; append-only payloads cannot be replaced; wrong-tenant/unauthorized runtime roles cannot access data.
- [ ] An abort/expiry during a lock wait releases connections and leaves no partial writes.
- [ ] Run affected original owner regressions and master-plan checks. Update only the model-only ledger, never infer complete original/V2 features.
