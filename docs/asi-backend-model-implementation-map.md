# Backend model implementation catalog

Proposed plan companion. Forty-three explicit families cover the fifty task entries in the approved design. Models return owner-backed data; this catalog is not product code or completion evidence.

## Shared interface conventions

Each factory takes `{owner, scope, clock}`. `scope` is a verified owner-bound tenant/principal context created by trusted composition, never request JSON. `clock` returns UTC milliseconds and defaults only at trusted composition. Model write methods accept a schema-validated record/request and canonical `RunContext`; mutable updates also take `expectedRevision` (or existing `expectedVersion`). Read methods take an ID or bounded query; ownership context stays bound to the factory. Explicit method results and SQL rules are defined in the master plan. Existing owner methods retain their precise semantics rather than being silently widened.

## skill

- Tasks: 18, V2-T05. Batch: memory.
- Model: `backend/models/skill.model.js`; factory `createSkillModel({owner,scope,clock})`.
- Record: `SkillInstallProposal`; schema `SkillInstallProposalSchema`; contract source `packages/contracts/src/backend-models/skill.ts`.
- Methods: `listSkills`, `getSkill`, `proposeInstall`, `getInstallProposal`. Behavior: append.
- Persistence: reuse skill_versions/skill_installs/skill_trust_records; add skill_install_proposals. Canonical repository: `backend/modules/skills/src/model-repositories/skill.ts`.
- Explicit relational identity/index fields or projection keys: `proposalId`, `skillId`, `version`, `publisherId`, `manifestDigest`, `expectedCatalogRevision`, `reviewState`.
- Required boundary assertions: signed+revoked+tenant checks; proposal does not install/execute; catalog limit <=100.
- Tests: `backend/tests/models/skill.test.js`.
- Source data shape: SkillInstallRequest: skillId, version, publisherId, manifestDigest, requestedCapabilityRefs, catalogEntryRef, expectedCatalogRevision. SkillInstallProposal: proposalId, same immutable digest, policyDecisionRef, reviewState(pending/approved/rejected), evalReportRef?, revocationState. Catalog results bound 1–100 entries, authenticated pagination; no executable marketplace payload.

## channel-delivery

- Tasks: 20. Batch: channels.
- Model: `backend/models/channel-delivery.model.js`; factory `createChannelDeliveryModel({owner,scope,clock})`.
- Record: `ChannelBindingRecord`; schema `ChannelBindingRecordSchema`; contract source `packages/contracts/src/backend-models/channel-delivery.ts`.
- Methods: `getBinding`, `bindChannel`, `getDelivery`, `listDeliveries`. Behavior: versioned.
- Persistence: channel_bindings; reuse ingress_events/delivery_outbox. Canonical repository: `backend/modules/control/src/model-repositories/channel-delivery.ts`.
- Explicit relational identity/index fields or projection keys: `bindingId`, `channelType`, `externalAccountRef`, `externalConversationRef`, `credentialHandleRef`, `version`.
- Required boundary assertions: forged tenant denied; opaque credentials only; model cannot deliver network messages.
- Tests: `backend/tests/models/channel-delivery.test.js`.

## protocol-connection

- Tasks: 22. Batch: channels.
- Model: `backend/models/protocol-connection.model.js`; factory `createProtocolConnectionModel({owner,scope,clock})`.
- Record: `ProtocolConnectionRecord`; schema `ProtocolConnectionRecordSchema`; contract source `packages/contracts/src/backend-models/protocol-connection.ts`.
- Methods: `registerConnection`, `getConnection`, `reviseConnection`, `listConnections`. Behavior: versioned.
- Persistence: protocol_connections. Canonical repository: `backend/modules/control/src/model-repositories/protocol-connection.ts`.
- Explicit relational identity/index fields or projection keys: `connectionId`, `protocolRevision`, `endpointRef`, `credentialHandleRef`, `capabilityDigest`, `version`, `expiresAt`.
- Required boundary assertions: MCP metadata cannot execute tools; endpoint policy before use; no freeform credentials.
- Tests: `backend/tests/models/protocol-connection.test.js`.

## remote-task

- Tasks: 23. Batch: channels.
- Model: `backend/models/remote-task.model.js`; factory `createRemoteTaskModel({owner,scope,clock})`.
- Record: `RemoteTaskRecord`; schema `RemoteTaskRecordSchema`; contract source `packages/contracts/src/backend-models/remote-task.ts`.
- Methods: `createRemoteTask`, `getRemoteTask`, `transitionRemoteTask`. Behavior: versioned.
- Persistence: remote_task_bindings. Canonical repository: `backend/modules/control/src/model-repositories/remote-task.ts`.
- Explicit relational identity/index fields or projection keys: `remoteTaskId`, `localTaskId`, `remoteAgentRef`, `protocolRevision`, `status`, `version`, `resultDigest`.
- Required boundary assertions: use existing A2A checked state mapping; no out-of-order terminal resurrection or duplicate effects.
- Tests: `backend/tests/models/remote-task.test.js`.

## fleet-assignment

- Tasks: 24. Batch: channels.
- Model: `backend/models/fleet-assignment.model.js`; factory `createFleetAssignmentModel({owner,scope,clock})`.
- Record: `FleetAssignmentRecord`; schema `FleetAssignmentRecordSchema`; contract source `packages/contracts/src/backend-models/fleet-assignment.ts`.
- Methods: `createAssignment`, `getAssignment`, `reviseAssignment`, `listAssignments`. Behavior: versioned.
- Persistence: fleet_assignments. Canonical repository: `backend/modules/control/src/model-repositories/fleet-assignment.ts`.
- Explicit relational identity/index fields or projection keys: `assignmentId`, `taskRef`, `agentVersionRef`, `grantRef`, `budgetRef`, `deadlineAt`, `version`.
- Required boundary assertions: one active scoped assignment per task+version; cancelled/expired parent denies reassignment.
- Tests: `backend/tests/models/fleet-assignment.test.js`.

## restore-report

- Tasks: 25. Batch: experimental.
- Model: `backend/models/restore-report.model.js`; factory `createRestoreReportModel({owner,scope,clock})`.
- Record: `RestoreReport`; schema `RestoreReportSchema`; contract source `packages/contracts/src/backend-models/restore-report.ts`.
- Methods: `appendRestoreReport`, `getRestoreReport`. Behavior: append.
- Persistence: restore_reports. Canonical repository: `backend/modules/control/src/model-repositories/restore-report.ts`.
- Explicit relational identity/index fields or projection keys: `restoreId`, `backupArtifactRef`, `backupDigest`, `targetEnvironmentRef`, `retentionPolicyRef`, `verificationRefs`.
- Required boundary assertions: report never restores/deletes data; restore evidence includes actual validation and limitations.
- Tests: `backend/tests/models/restore-report.test.js`.

## consolidation-candidate

- Tasks: 26. Batch: memory.
- Model: `backend/models/consolidation-candidate.model.js`; factory `createConsolidationCandidateModel({owner,scope,clock})`.
- Record: `ConsolidationCandidate`; schema `ConsolidationCandidateSchema`; contract source `packages/contracts/src/backend-models/consolidation-candidate.ts`.
- Methods: `appendCandidate`, `getCandidate`, `listCandidates`. Behavior: append.
- Persistence: consolidation_candidates. Canonical repository: `backend/modules/memory/src/model-repositories/consolidation-candidate.ts`.
- Explicit relational identity/index fields or projection keys: `candidateId`, `sourceMemoryRefs`, `sourceEpisodeRefs`, `candidateDigest`, `evalReportRef`, `expectedMemoryVersions`.
- Required boundary assertions: candidate is not a published fact; provenance/scope preserved; CAS checked at later publication.
- Tests: `backend/tests/models/consolidation-candidate.test.js`.

## tool-candidate

- Tasks: 27. Batch: experimental.
- Model: `backend/models/tool-candidate.model.js`; factory `createToolCandidateModel({owner,scope,clock})`.
- Record: `ToolCandidateRecord`; schema `ToolCandidateRecordSchema`; contract source `packages/contracts/src/backend-models/tool-candidate.ts`.
- Methods: `appendCandidate`, `getCandidate`, `listCandidates`. Behavior: append.
- Persistence: tool_candidates. Canonical repository: `backend/modules/control/src/model-repositories/tool-candidate.ts`.
- Explicit relational identity/index fields or projection keys: `candidateId`, `manifestDigest`, `artifactDigest`, `evalReportRefs`, `versionRef`, `reviewState`.
- Required boundary assertions: candidate cannot edit protected evals/sign/promote itself; data storage only.
- Tests: `backend/tests/models/tool-candidate.test.js`.

## observation

- Tasks: 28, V2-T22. Batch: memory.
- Model: `backend/models/observation.model.js`; factory `createObservationModel({owner,scope,clock})`.
- Record: `Observation`; schema `ObservationSchema`; contract source `packages/contracts/src/backend-models/observation.ts`.
- Methods: `getObservation`, `reviseObservation`, `queryGraph`, `listObservations`. Behavior: versioned.
- Persistence: reuse observations/observation_revisions/observation_exchange. Canonical repository: `backend/modules/memory/src/model-repositories/observation.ts`.
- Explicit relational identity/index fields or projection keys: `observationId`, `entity`, `relation`, `value`, `scope`, `roleId`, `ownerAgentId`, `revision`, `validUntil`.
- Required boundary assertions: depth1..2/limit1..100; filter every graph hop and scope inheritance; reject cycles beyond depth.
- Tests: `backend/tests/models/observation.test.js`.
- Source data shape: GraphQuery: permitted scope refs, entityRefs, relationTypes, maxDepth(1–2), limit(1–100), cursor?. GraphResult: scoped observations/relations with sourceRefs, validUntil, revisions, nextCursor. Every traversal hop is tenant/role/private filtered inside existing PostgreSQL observation broker; no new graph database.

## scaffold-candidate

- Tasks: 29. Batch: experimental.
- Model: `backend/models/scaffold-candidate.model.js`; factory `createScaffoldCandidateModel({owner,scope,clock})`.
- Record: `ScaffoldCandidateRecord`; schema `ScaffoldCandidateRecordSchema`; contract source `packages/contracts/src/backend-models/scaffold-candidate.ts`.
- Methods: `appendCandidate`, `getCandidate`, `listCandidates`. Behavior: append.
- Persistence: scaffold_candidates. Canonical repository: `backend/modules/control/src/model-repositories/scaffold-candidate.ts`.
- Explicit relational identity/index fields or projection keys: `candidateId`, `baseVersionRef`, `candidateDigest`, `assignedPathRefs`, `evalReportRefs`, `reviewState`.
- Required boundary assertions: protected paths denied; existing working files not touched; promotion separate.
- Tests: `backend/tests/models/scaffold-candidate.test.js`.

## task-plan

- Tasks: V2-T02. Batch: core.
- Model: `backend/models/task-plan.model.js`; factory `createTaskPlanModel({owner,scope,clock})`.
- Record: `TaskPlan`; schema `TaskPlanSchema`; contract source `packages/contracts/src/plan.ts`.
- Methods: `createPlan`, `getPlan`, `revisePlan`, `listPlans`. Behavior: versioned.
- Persistence: task_plans. Canonical repository: `backend/modules/control/src/model-repositories/task-plan.ts`.
- Explicit relational identity/index fields or projection keys: `planId`, `goalId`, `goalRevision`, `revision`, `planDigest`.
- Required boundary assertions: reject cycles/duplicate step IDs; goal revision and digest match; parallelism <=8.
- Tests: `backend/tests/models/task-plan.test.js`.
- Source data shape: TaskPlan/PlanStep/PlanValidation/StepOutcome use section 5. Canonical planDigest binds goalRevision and ordered validated steps; scheduler accepts only completed predecessor outcomes and never treats unknown as completed.

## critique-report

- Tasks: V2-T03. Batch: reasoning.
- Model: `backend/models/critique-report.model.js`; factory `createCritiqueReportModel({owner,scope,clock})`.
- Record: `CritiqueReport`; schema `CritiqueReportSchema`; contract source `packages/contracts/src/backend-models/critique-report.ts`.
- Methods: `appendCritique`, `getCritique`, `listCritiques`. Behavior: append.
- Persistence: critique_reports. Canonical repository: `backend/modules/control/src/model-repositories/critique-report.ts`.
- Explicit relational identity/index fields or projection keys: `reportId`, `goalId`, `goalRevision`, `taskResultRef`, `criticId`, `criticVersion`, `round`.
- Required boundary assertions: <=32 findings and <=2 rounds; critic findings do not change approval/policy.
- Tests: `backend/tests/models/critique-report.test.js`.
- Source data shape: CritiqueReport: reportId, goalId, goalRevision, taskResultRef, criticId/version, findings[{claimId, category(unsupported/conflict/error/missing_evidence), evidenceRefs, safeSummary}], suggestedPlanRevision?, usage. At most 32 findings and 2 critique rounds per interactive run within inherited iteration/task caps.

## skill-selection

- Tasks: V2-T06. Batch: memory.
- Model: `backend/models/skill-selection.model.js`; factory `createSkillSelectionModel({owner,scope,clock})`.
- Record: `QualifiedSkillSelection`; schema `QualifiedSkillSelectionSchema`; contract source `packages/contracts/src/backend-models/skill-selection.ts`.
- Methods: `selectQualifiedSkills`. Behavior: projection.
- Persistence: none: deterministic selection projection. No new SQL writer.
- Explicit relational identity/index fields or projection keys: `skill version/digest refs`, `omitted reasons`, `tokenCount`.
- Required boundary assertions: verified/nonrevoked/currently authorized filtering before ranking and token budget.
- Tests: `backend/tests/models/skill-selection.test.js`.
- Source data shape: SkillSelectionRequest: taskType, availableSkillRefs, requestedSkillRefs, maxContextTokens, grantRef. QualifiedSkillSelection: sorted skillId/version/digest refs, selectedInstructionRefs, omitted reasons, tokenCount. Selection filters verified/nonrevoked/authorized skills before deterministic ranking; instructions remain distinct from untrusted data.

## agent-definition

- Tasks: V2-T07. Batch: core.
- Model: `backend/models/agent-definition.model.js`; factory `createAgentDefinitionModel({owner,scope,clock})`.
- Record: `AgentDefinitionProposal`; schema `AgentDefinitionProposalSchema`; contract source `packages/contracts/src/backend-models/agent-definition.ts`.
- Methods: `createProposal`, `getProposal`, `listProposals`. Behavior: append.
- Persistence: agent_definition_proposals. Canonical repository: `backend/modules/control/src/model-repositories/agent-definition.ts`.
- Explicit relational identity/index fields or projection keys: `proposalId`, `definitionId`, `candidateDigest`, `versionRef`, `policyDecisionRef`.
- Required boundary assertions: definition validation cannot grant/deploy; immutable candidate digest.
- Tests: `backend/tests/models/agent-definition.test.js`.
- Source data shape: AgentDefinitionCandidate: definitionId, roleId, promptArtifactDigest, modelPolicyRef, skillVersionRefs, toolManifestRefs, requestedCapabilityRefs, memoryPolicyRef, evalSetRef. AgentDefinitionProposal: proposalId, candidateDigest, evalReportRef, policyDecisionRef, lifecycle(staged/denied/review_required), versionRef. Never deploy or issue authority on definition validation alone.

## agent-lifecycle

- Tasks: V2-T08. Batch: core.
- Model: `backend/models/agent-lifecycle.model.js`; factory `createAgentLifecycleModel({owner,scope,clock})`.
- Record: `AgentLifecycleResult`; schema `AgentLifecycleResultSchema`; contract source `packages/contracts/src/backend-models/agent-lifecycle.ts`.
- Methods: `getAgent`, `transitionAgent`, `listAgents`. Behavior: versioned.
- Persistence: agent_lifecycle. Canonical repository: `backend/modules/control/src/model-repositories/agent-lifecycle.ts`.
- Explicit relational identity/index fields or projection keys: `agentId`, `definitionVersionRef`, `owningRunId`, `checkpointRef`, `lifecycle`, `lastTransitionAt`.
- Required boundary assertions: reject invalid/stale transitions; stopped/revoked cannot resume without current grant.
- Tests: `backend/tests/models/agent-lifecycle.test.js`.
- Source data shape: AgentLifecycleResult: agentId, definitionVersionRef, checkpointRef?, owningRunId?, lifecycle(active/suspended/stopped/revoked/failed), lastTransitionAt, currentGrantRef?, nextScheduleRef?. Persistent agents resume only with current authorization; stop revokes future dispatch and cancels bounded active work.

## trigger

- Tasks: V2-T09. Batch: channels.
- Model: `backend/models/trigger.model.js`; factory `createTriggerModel({owner,scope,clock})`.
- Record: `TriggerAcceptance`; schema `TriggerAcceptanceSchema`; contract source `packages/contracts/src/backend-models/trigger.ts`.
- Methods: `acceptTrigger`, `getTriggerAcceptance`. Behavior: append.
- Persistence: reuse ingress_events; trigger_acceptances if canonical ingress has no required bindings. Canonical repository: `backend/modules/control/src/model-repositories/trigger.ts`.
- Explicit relational identity/index fields or projection keys: `acceptedId`, `sourceId`, `externalEventId`, `observedDigest`, `signatureVerificationRef`.
- Required boundary assertions: trusted tenant only; same external key+digest dedup; altered digest conflict; bound rate/capacity.
- Tests: `backend/tests/models/trigger.test.js`.
- Source data shape: TriggerEvent: schemaVersion, eventId, tenantId (derived by trusted adapter), sourceId, externalEventId, occurredAt, receivedAt, bounded payloadRef, signatureVerificationRef. TriggerAcceptance: acceptedId, duplicate boolean, scheduledRunRef?, status(accepted/rejected/rate_limited). Idempotency keys bind tenant/source/externalEventId and validated digest.

## schedule

- Tasks: V2-T10. Batch: channels.
- Model: `backend/models/schedule.model.js`; factory `createScheduleModel({owner,scope,clock})`.
- Record: `ScheduleRecord`; schema `ScheduleRecordSchema`; contract source `packages/contracts/src/backend-models/schedule.ts`.
- Methods: `createSchedule`, `getSchedule`, `reviseSchedule`, `disableSchedule`, `listSchedules`. Behavior: versioned.
- Persistence: reuse heartbeat schedules; add schedule_specs for broader contract. Canonical repository: `backend/modules/control/src/model-repositories/schedule.ts`.
- Explicit relational identity/index fields or projection keys: `scheduleId`, `owningConversationId`, `version`, `timezone`, `nextRunAt`, `enabled`, `budgetRef`, `grantRef`.
- Required boundary assertions: DST/missed-run/overlap policy validated; no arbitrary code; no scheduler execution in model.
- Tests: `backend/tests/models/schedule.test.js`.
- Source data shape: ScheduleSpec: scheduleId, tenantId, owningConversationId, goalRef, timezone(IANA), scheduleExpression, missedRunPolicy(skip/run_once), overlapPolicy(skip/queue_one), notificationIntent, version, budgetRef, grantRef. ScheduleRecord adds nextRunAt, lastRunRef?, enabled, policyDecisionRef. DST gaps/overlaps, deletion and downtime have explicit deterministic fixtures; no arbitrary code in expressions.

## approval-quorum

- Tasks: V2-T11. Batch: governance.
- Model: `backend/models/approval-quorum.model.js`; factory `createApprovalQuorumModel({owner,scope,clock})`.
- Record: `ApprovalQuorumRequest`; schema `ApprovalQuorumRequestSchema`; contract source `packages/contracts/src/backend-models/approval-quorum.ts`.
- Methods: `createQuorum`, `getQuorum`, `recordDecision`, `readDecision`. Behavior: authority.
- Persistence: approval_quorums + approval_quorum_decisions. Canonical repository: `backend/modules/policy/src/model-repositories/approval-quorum.ts`.
- Explicit relational identity/index fields or projection keys: `quorumId`, `effectRef`, `inputHash`, `policyVersion`, `proposalVersion`, `expiresAt`, `nonceRef`.
- Required boundary assertions: authenticated actors distinct; exact binding and expiry; changed proposal invalidates old decisions.
- Tests: `backend/tests/models/approval-quorum.test.js`.
- Source data shape: ApprovalQuorumRequest: effectRef/inputHash/artifactHash?, policyVersion, proposalVersion, requiredActorRoles, quorumCount, expiresAt, nonceRef. ApprovalQuorumDecision: pending/allowed/denied/expired plus authenticated decisionRefs, exact binding and current epoch. Modification creates a new proposal/version; no client-provided replacement effect args.

## resource-grant

- Tasks: V2-T12. Batch: governance.
- Model: `backend/models/resource-grant.model.js`; factory `createResourceGrantModel({owner,scope,clock})`.
- Record: `ResourceGrantRequest`; schema `ResourceGrantRequestSchema`; contract source `packages/contracts/src/backend-models/resource-grant.ts`.
- Methods: `requestGrant`, `getGrant`, `revokeGrant`. Behavior: authority.
- Persistence: reuse identity_grants through PostgresGrantStore and current identity issuer. Canonical repository: `backend/modules/identity/src/model-repositories/resource-grant.ts`.
- Explicit relational identity/index fields or projection keys: `grantId`, `tenantId`, `parentGrantId`, `audience`, `capabilities`, `expiresAt`, `revokedAt`.
- Required boundary assertions: use existing issuance/verifier; child subset and audience; no signing key on model object.
- Tests: `backend/tests/models/resource-grant.test.js`.
- Source data shape: ResourceGrantRequest: requested action/resource/audience constraints, expiry, parentGrantRef, delegationDepth. Signed grants bind verified parent lineage, tenant, audience, action and resource selectors; deny unknown/revoked parents, widened selectors and expiry beyond parent. Opaque signing keys remain in identity service.

## action-preview

- Tasks: V2-T13. Batch: governance.
- Model: `backend/models/action-preview.model.js`; factory `createActionPreviewModel({owner,scope,clock})`.
- Record: `ActionPreview`; schema `ActionPreviewSchema`; contract source `packages/contracts/src/backend-models/action-preview.ts`.
- Methods: `appendPreview`, `getPreview`, `listPreviews`. Behavior: append.
- Persistence: action_previews. Canonical repository: `backend/modules/control/src/model-repositories/action-preview.ts`.
- Explicit relational identity/index fields or projection keys: `previewId`, `effectId`, `inputHash`, `artifactHash`, `version`, `expiresAt`.
- Required boundary assertions: no effects during model writes; executable approval requires exact current input/artifact digest.
- Tests: `backend/tests/models/action-preview.test.js`.
- Source data shape: ActionPreview: previewId, effectId, inputHash, artifactHash?, simulationReportRef, assumptions, proposedChangesRef, estimatedCostMicroUsd|null, risks, expiresAt, version. Preview uses no-live-effect grants; later execution revalidates current authority and exact reviewed digest.

## compensation-plan

- Tasks: V2-T14. Batch: governance.
- Model: `backend/models/compensation-plan.model.js`; factory `createCompensationPlanModel({owner,scope,clock})`.
- Record: `CompensationPlan`; schema `CompensationPlanSchema`; contract source `packages/contracts/src/backend-models/compensation-plan.ts`.
- Methods: `appendCompensationPlan`, `getCompensationPlan`. Behavior: append.
- Persistence: compensation_plans. Canonical repository: `backend/modules/control/src/model-repositories/compensation-plan.ts`.
- Explicit relational identity/index fields or projection keys: `planId`, `originalReceiptRef`, `expectedStateDigest`, `requiredApprovalRef`, `boundedDeadline`.
- Required boundary assertions: unknown/irreversible effects not silently undone; plan never dispatches compensation.
- Tests: `backend/tests/models/compensation-plan.test.js`.
- Source data shape: CompensationPlan: planId, originalReceiptRef, observedStateRef, supportedActionRefs, irreversibleOutcomes, requiredApprovalRef, expectedStateDigest, boundedDeadline. Every compensation is a new authorized journaled effect; plan cannot promise universal rollback or undo unknown external outcomes automatically.

## recovery-plan

- Tasks: V2-T15. Batch: reasoning.
- Model: `backend/models/recovery-plan.model.js`; factory `createRecoveryPlanModel({owner,scope,clock})`.
- Record: `RecoveryPlan`; schema `RecoveryPlanSchema`; contract source `packages/contracts/src/backend-models/recovery-plan.ts`.
- Methods: `deriveRecoveryPlan`. Behavior: projection.
- Persistence: none: canonical error/effect/retry projection. No new SQL writer.
- Explicit relational identity/index fields or projection keys: `decision`, `reasonCode`, `approvedAlternativeRefs`, `maxRemainingAttempts`.
- Required boundary assertions: unknown external outcome => reconcile; attempts include previous; no privacy relaxation.
- Tests: `backend/tests/models/recovery-plan.test.js`.
- Source data shape: RecoveryInput: failedTaskRef, normalizedError, receiptRef?, currentPlanRef, attemptsAlreadyUsed. RecoveryPlan: retry/reconcile/replan/stop, reasonCode, approvedAlternativeRefs, nextPlanRevision?, maxRemainingAttempts. Unknown external effects select reconcile; retry cap includes previous attempts and excludes forbidden provider fallback.

## worker-score

- Tasks: V2-T16. Batch: reasoning.
- Model: `backend/models/worker-score.model.js`; factory `createWorkerScoreModel({owner,scope,clock})`.
- Record: `WorkerScore`; schema `WorkerScoreSchema`; contract source `packages/contracts/src/backend-models/worker-score.ts`.
- Methods: `getWorkerScore`, `rankEligibleWorkers`. Behavior: projection.
- Persistence: none: versioned telemetry/worker evidence projection. No new SQL writer.
- Explicit relational identity/index fields or projection keys: `workerId`, `metricVersion`, `sampleCount`, `evidenceRefs`, `measuredAt`, `validUntil`.
- Required boundary assertions: eligibility before score; reject stale/poisoned samples; deterministic ties.
- Tests: `backend/tests/models/worker-score.test.js`.
- Source data shape: WorkerScore: workerId, metricVersion, sampleCount, quality/latency/cost/violation aggregates, evidenceRefs, measuredAt, validUntil. RankedWorker: workerId, eligibility, scoreBasis, deterministicRank. Eligibility (health/current grants/capacity/policy) precedes scoring; stale/poisoned samples cannot elevate unsafe workers.

## candidate-comparison

- Tasks: V2-T17. Batch: reasoning.
- Model: `backend/models/candidate-comparison.model.js`; factory `createCandidateComparisonModel({owner,scope,clock})`.
- Record: `CandidateComparison`; schema `CandidateComparisonSchema`; contract source `packages/contracts/src/backend-models/candidate-comparison.ts`.
- Methods: `appendComparison`, `getComparison`. Behavior: append.
- Persistence: candidate_comparisons. Canonical repository: `backend/modules/control/src/model-repositories/candidate-comparison.ts`.
- Explicit relational identity/index fields or projection keys: `comparisonId`, `goalRef`, `planRef`, `evaluatorVersionRef`, `winnerRef`, `budgetRef`.
- Required boundary assertions: 2..4 candidates; noLiveWrites=true; shared recorded usage <=budget; judge cannot authorize.
- Tests: `backend/tests/models/candidate-comparison.test.js`.
- Source data shape: CandidateComparisonRequest: goalRef, planRef, candidateRefs(2–4), evaluatorVersionRef, budgetRef, noLiveWrites=true. CandidateComparison: winnerRef|null, criterionResults, disagreementSummary, evidenceRefs, usage. Each candidate isolated; judge cannot authorize execution or exceed shared budget.

## debate-report

- Tasks: V2-T18. Batch: reasoning.
- Model: `backend/models/debate-report.model.js`; factory `createDebateReportModel({owner,scope,clock})`.
- Record: `DebateReport`; schema `DebateReportSchema`; contract source `packages/contracts/src/backend-models/debate-report.ts`.
- Methods: `appendDebate`, `getDebate`. Behavior: append.
- Persistence: debate_reports. Canonical repository: `backend/modules/control/src/model-repositories/debate-report.ts`.
- Explicit relational identity/index fields or projection keys: `debateId`, `proposalVersionRef`, `budgetRef`, `rounds`, `usage`.
- Required boundary assertions: 2..4 roles/1..2 rounds; inherited8delegations/12iterations; preserve disagreement/evidence.
- Tests: `backend/tests/models/debate-report.test.js`.
- Source data shape: DebateRequest: proposalArtifactRef, roleRefs(2–4), maxRounds(1–2), successCriteriaRefs, budgetRef. DebateReport: proposalVersionRef, bounded contributions/evidenceRefs, disagreements, recommendations, usage. Two-round debate remains within inherited 8 delegated-task and 12 model-iteration caps.

## budget-allocation

- Tasks: V2-T19. Batch: governance.
- Model: `backend/models/budget-allocation.model.js`; factory `createBudgetAllocationModel({owner,scope,clock})`.
- Record: `BudgetAllocationPlan`; schema `BudgetAllocationPlanSchema`; contract source `packages/contracts/src/backend-models/budget-allocation.ts`.
- Methods: `readBudget`, `proposeAllocation`, `getAllocation`. Behavior: append.
- Persistence: budget_allocation_plans; reuse budget_accounts/budget_reservations. Canonical repository: `backend/modules/budgets/src/model-repositories/budget-allocation.ts`.
- Explicit relational identity/index fields or projection keys: `allocationId`, `budgetRef`, `version`, `totalReserved`.
- Required boundary assertions: plan is advisory until atomic owner reservations; concurrent spend cannot exceed quota; integer overflow rejected.
- Tests: `backend/tests/models/budget-allocation.test.js`.
- Source data shape: BudgetAllocationRequest: budgetRef, proposedWorkRefs, observedCostRefs, expectedVersion. BudgetAllocationPlan: version, allocations[{workRef,reservedTokens,reservedCostMicroUsd}], unknownUsageRefs, totalReserved. Reservation remains authoritative atomic budget service; optimization cannot exceed approved parent/tenant quotas.

## context-bundle

- Tasks: V2-T20. Batch: memory.
- Model: `backend/models/context-bundle.model.js`; factory `createContextBundleModel({owner,scope,clock})`.
- Record: `ContextBundle`; schema `ContextBundleSchema`; contract source `packages/contracts/src/backend-models/context-bundle.ts`.
- Methods: `compileContextBundle`. Behavior: projection.
- Persistence: none: compiled artifact reference projection. No new SQL writer.
- Explicit relational identity/index fields or projection keys: `ordered source refs`, `compiledArtifactRef`, `prefixHash`, `tokenCount`, `trustLabels`.
- Required boundary assertions: preserve complete tool groups/stable prefix; reject unauthorized source; exact token bound.
- Tests: `backend/tests/models/context-bundle.test.js`.
- Source data shape: ContextCompileRequest: permittedSourceRefs, goalRef?, taskType, maxContextTokens, stablePrefixRef, requiredToolGroupRefs. ContextBundle: ordered sourceRefs, compiledArtifactRef, prefixHash, tokenCount, omittedRefs/reasons, trustLabels. Preserve complete tool groups and inherited compression thresholds; measure retained-evidence recall.

## memory-lifecycle

- Tasks: V2-T21. Batch: memory.
- Model: `backend/models/memory-lifecycle.model.js`; factory `createMemoryLifecycleModel({owner,scope,clock})`.
- Record: `MemoryLifecycleRevision`; schema `MemoryLifecycleRevisionSchema`; contract source `packages/contracts/src/backend-models/memory-lifecycle.ts`.
- Methods: `getMemory`, `reviseMemoryLifecycle`, `listRevisions`. Behavior: versioned.
- Persistence: existing memory_records/memory_revisions; reserved 012-v2-memory-lifecycle.sql. Canonical repository: `backend/modules/memory/src/model-repositories/memory-lifecycle.ts`.
- Explicit relational identity/index fields or projection keys: `memoryId`, `expectedMemoryVersion`, `sourceRefs`, `confidenceBasis`, `verifiedAt`, `expiresAt`.
- Required boundary assertions: CAS; preserve numeric confidence; expired facts cannot outrank correction; role/private visibility.
- Tests: `backend/tests/models/memory-lifecycle.test.js`.
- Source data shape: MemoryLifecycleRevision: memoryId, expectedMemoryVersion, sourceRefs, confidenceBasis, createdAt, verifiedAt?, expiresAt?, contradictionRefs, proposedValueRef?. Existing numeric confidence is preserved with a declared basis. Lifecycle metadata and value revisions use broker authorization/CAS; expired facts cannot outrank verified corrections.

## memory-branch

- Tasks: V2-T23. Batch: memory.
- Model: `backend/models/memory-branch.model.js`; factory `createMemoryBranchModel({owner,scope,clock})`.
- Record: `MemoryBranchRecord`; schema `MemoryBranchRecordSchema`; contract source `packages/contracts/src/backend-models/memory-branch.ts`.
- Methods: `createBranch`, `getBranch`, `reviseBranch`, `queryBranch`. Behavior: versioned.
- Persistence: memory_branches + memory_branch_members. Canonical repository: `backend/modules/memory/src/model-repositories/memory-branch.ts`.
- Explicit relational identity/index fields or projection keys: `branchId`, `parentBranchId`, `version`, `expiresAt`, `grantRefs`, `visibilityScope`.
- Required boundary assertions: same-tenant ancestry; deny audience widening/cycles/expired ancestry; no Private-to-Global copy.
- Tests: `backend/tests/models/memory-branch.test.js`.
- Source data shape: MemoryBranchQuery: branchId, requestedScopeRefs, queryRef, expectedBranchVersion, limit(1–100). MemoryBranchResult: authorized branch ancestry, matching memoryRefs, versions, nextCursor?. Branch metadata defines parent/expiry/grants; inheritance never widens audience or copies Private facts into Global.

## credential-binding

- Tasks: V2-T24. Batch: governance.
- Model: `backend/models/credential-binding.model.js`; factory `createCredentialBindingModel({owner,scope,clock})`.
- Record: `CredentialResolution`; schema `CredentialResolutionSchema`; contract source `packages/contracts/src/backend-models/credential-binding.ts`.
- Methods: `getBinding`, `expireBinding`, `revokeBinding`. Behavior: authority.
- Persistence: credential_binding_metadata: opaque handles and target bindings only; no credential material. Canonical repository: `backend/modules/identity/src/model-repositories/credential-binding.ts`.
- Explicit relational identity/index fields or projection keys: `bindingId`, `handleId`, `verifiedEffectRef`, `allowedTargetDigest`, `expiresAt`, `revokedAt`.
- Required boundary assertions: only opaque execution binding; forged target/expired/revoked handles rejected; no secret resolution in HTTP model.
- Tests: `backend/tests/models/credential-binding.test.js`.
- Source data shape: CredentialHandleRequest: opaque handleId, verified effectRef, requiredAction/resource/audience, expiry and RunContext. CredentialResolution: opaque executionBindingRef, expiry, allowedTargetDigest. Resolution stays within trusted broker/executor; provider/DB/signing plaintext never reaches model, specialist task, UI or semantic memory.

## project

- Tasks: V2-T25. Batch: core.
- Model: `backend/models/project.model.js`; factory `createProjectModel({owner,scope,clock})`.
- Record: `ProjectRecord`; schema `ProjectRecordSchema`; contract source `packages/contracts/src/project.ts`.
- Methods: `createProject`, `getProject`, `reviseProject`, `listProjects`. Behavior: versioned.
- Persistence: projects. Canonical repository: `backend/modules/control/src/model-repositories/project.ts`.
- Explicit relational identity/index fields or projection keys: `projectId`, `conversationId`, `version`, `status`.
- Required boundary assertions: completion requires current required goal verification; preserve canonical version field.
- Tests: `backend/tests/models/project.test.js`.
- Source data shape: ProjectRecord uses section 5. Restart preserves goal/plan/artifact/blocker refs and current revisions. Completion derives from required verified goals; renewed grants and per-run/project budget govern every resumed operation.

## workspace-lease

- Tasks: V2-T26. Batch: experimental.
- Model: `backend/models/workspace-lease.model.js`; factory `createWorkspaceLeaseModel({owner,scope,clock})`.
- Record: `WorkspaceLease`; schema `WorkspaceLeaseSchema`; contract source `packages/contracts/src/backend-models/workspace-lease.ts`.
- Methods: `recordLease`, `getLease`, `expireLease`, `recordCleanup`. Behavior: versioned.
- Persistence: workspace_leases. Canonical repository: `backend/modules/control/src/model-repositories/workspace-lease.ts`.
- Explicit relational identity/index fields or projection keys: `leaseId`, `workspaceId`, `rootRef`, `profileDigest`, `expiresAt`, `cleanupState`, `version`.
- Required boundary assertions: opaque canonical root; no escape/symlink widening; model cannot provision host filesystem.
- Tests: `backend/tests/models/workspace-lease.test.js`.
- Source data shape: WorkspaceRequest: workspaceId, agentDefinitionRef, assignedPathRefs, readOnlyMountRefs, allowedDomains, byteQuota, expiresAt, retentionPolicyRef. WorkspaceLease: leaseId, opaque rootRef, validated mount/network profileDigest, expiry, cleanupState. Canonical path and symlink checks prevent escaping assigned roots.

## artifact

- Tasks: V2-T27. Batch: core.
- Model: `backend/models/artifact.model.js`; factory `createArtifactModel({owner,scope,clock})`.
- Record: `ArtifactCandidate`; schema `ArtifactCandidateSchema`; contract source `packages/contracts/src/backend-models/artifact.ts`.
- Methods: `registerArtifact`, `getArtifact`, `listArtifacts`. Behavior: append.
- Persistence: artifact_records. Canonical repository: `backend/modules/control/src/model-repositories/artifact.ts`.
- Explicit relational identity/index fields or projection keys: `artifactId`, `owningConversationId`, `runId`, `sha256`, `mediaType`, `byteSize`, `visibilityScope`.
- Required boundary assertions: registered digest matches trusted artifact-store bytes; metadata registration never publishes.
- Tests: `backend/tests/models/artifact.test.js`.
- Source data shape: ArtifactCandidate: artifactId, tenantId, owningConversationId/runId, mediaType, byteSize, contentRef, sha256, producerVersionRef, sourceEvidenceRefs, validationReportRef, visibilityScope. ArtifactReference remains the existing compatible reference; safe metadata supplies provenance. Publication/export is a separate authorized effect.

## specialist-task

- Tasks: V2-T28, V2-T29, V2-T30, V2-T31. Batch: reasoning.
- Model: `backend/models/specialist-task.model.js`; factory `createSpecialistTaskModel({owner,scope,clock})`.
- Record: `SpecialistTaskProfile`; schema `SpecialistTaskProfileSchema`; contract source `packages/contracts/src/backend-models/specialist-task.ts`.
- Methods: `createTaskProfile`, `getTaskProfile`, `listTaskProfiles`. Behavior: versioned.
- Persistence: specialist_task_profiles; reuse canonical Task/TaskResult. Canonical repository: `backend/modules/control/src/model-repositories/specialist-task.ts`.
- Explicit relational identity/index fields or projection keys: `taskId`, `profileType`, `goalRef`, `profileDigest`, `deadlineAt`, `version`.
- Required boundary assertions: browser/domain; data readOnly+row/byte/time; coding assignedPaths/baseCommit; research maxQueries/source bounds.
- Tests: `backend/tests/models/specialist-task.test.js`.
- Source data shape: BrowserTask: taskId, goalRef, startingUrl, allowedDomainRefs, sessionProfileRef, permittedActionRefs, upload/downloadRefs, approvalRefs, deadline. Sensitive form submissions require exact policy approval; domain/redirect/file checks apply at execution; returns existing TaskResult evidence and artifacts.
- Source data shape: DataTask: taskId, goalRef, connectionHandleRef, permittedSchemaRefs, queryArtifactRef, readOnly=true by default, row/byte/time limits, analysisCriteriaRefs. SQL parser/resource policy, real database runtime role and read limits precede execution. Output includes reproducible arithmetic and source/result digests; writes require a separate reviewed effect.
- Source data shape: CodingTask: taskId, goalRef, repositoryRef, baseCommit, assignedPaths, allowedCommands, branchRef, acceptanceTestRefs, reviewPolicyRef. Branch/test/diff/PR stages are separate effects; no merge/deploy authority implied. Required independent review and scans attach evidence to existing TaskResult.
- Source data shape: ResearchTask: taskId, goalRef, question, hypothesisRefs, permittedSourceRefs, maxQueries, claimCriteriaRefs, graphMode(disabled/scoped). Results use EvidenceClaim and VerificationReport, source timestamps, contradiction/unknown states. Persistent graph requires original 28 qualification; ordinary research does not silently enable it.

## security-alert

- Tasks: V2-T32. Batch: reasoning.
- Model: `backend/models/security-alert.model.js`; factory `createSecurityAlertModel({owner,scope,clock})`.
- Record: `SecurityAlert`; schema `SecurityAlertSchema`; contract source `packages/contracts/src/backend-models/security-alert.ts`.
- Methods: `appendAlert`, `getAlert`, `listAlerts`. Behavior: append.
- Persistence: security_alerts. Canonical repository: `backend/modules/control/src/model-repositories/security-alert.ts`.
- Explicit relational identity/index fields or projection keys: `alertId`, `severity`, `observedAt`, `detectorVersion`, `signedReceiptRef`.
- Required boundary assertions: 1..100 safe signals; signed evidence; observation cannot mutate policy or self-grant.
- Tests: `backend/tests/models/security-alert.test.js`.
- Source data shape: SecuritySignalBatch: tenantId, bounded metadata signalRefs(1–100), windowStart/end, detectorVersion. SecurityAlert: alertId, severity, observedAt, evidenceRefs, detectorVersion, signedReceiptRef, safeRecommendation. Monitor can observe/report only; it cannot grant permissions or edit protected policy.

## trust-label

- Tasks: V2-T33. Batch: reasoning.
- Model: `backend/models/trust-label.model.js`; factory `createTrustLabelModel({owner,scope,clock})`.
- Record: `TrustLabelledInput`; schema `TrustLabelledInputSchema`; contract source `packages/contracts/src/backend-models/trust-label.ts`.
- Methods: `labelInput`. Behavior: projection.
- Persistence: none: input trust projection. No new SQL writer.
- Explicit relational identity/index fields or projection keys: `inputRef`, `origin`, `observedDigest`, `instructionTrust`, `flags`, `quarantineRef`.
- Required boundary assertions: instructionTrust always untrusted_data; detector misses never raise authority.
- Tests: `backend/tests/models/trust-label.test.js`.
- Source data shape: UntrustedInput: inputRef, origin(web/tool/memory/episode/skill/remote), observedDigest, bounded contentRef. TrustLabelledInput: same refs/digest, instructionTrust(untrusted_data), flags, quarantineRef?. Detection false negatives never promote content to authorization; content cannot alter policy or credential scope.

## decision-summary

- Tasks: V2-T34. Batch: governance.
- Model: `backend/models/decision-summary.model.js`; factory `createDecisionSummaryModel({owner,scope,clock})`.
- Record: `DecisionSummary`; schema `DecisionSummarySchema`; contract source `packages/contracts/src/backend-models/decision-summary.ts`.
- Methods: `getDecisionSummary`, `listDecisionSummaries`. Behavior: projection.
- Persistence: none: projection of audit receipts. No new SQL writer.
- Explicit relational identity/index fields or projection keys: `decisionId`, `receiptRef`, `receiptHash`, `policyVersion`, `occurredAt`, `redactionVersion`.
- Required boundary assertions: verify receipt/hash and principal filter before safe projection; no raw prompt/chain of thought.
- Tests: `backend/tests/models/decision-summary.test.js`.
- Source data shape: DecisionSummary: decisionId, receiptRef/hash, action/target summaries, evidenceRefs, policyVersion, model/tool version refs, occurredAt, uncertainty, redactionVersion. Principal filtering precedes projection; no secrets, private chain-of-thought or raw provider prompts.

## replay-view

- Tasks: V2-T35. Batch: reasoning.
- Model: `backend/models/replay-view.model.js`; factory `createReplayViewModel({owner,scope,clock})`.
- Record: `ReplayView`; schema `ReplayViewSchema`; contract source `packages/contracts/src/backend-models/replay-view.ts`.
- Methods: `readReplay`. Behavior: projection.
- Persistence: none: checkpoints/episodes/effect results read projection. No new SQL writer.
- Explicit relational identity/index fields or projection keys: `runId`, `fromSequence`, `toSequence`, `limit`, `mode`.
- Required boundary assertions: read_only and1..100; ordered recorded refs; zero replayed external effects.
- Tests: `backend/tests/models/replay-view.test.js`.
- Source data shape: ReplayQuery: tenant-derived principal scope, runId, fromSequence/toSequence, limit(1–100), mode=read_only. ReplayView: ordered checkpoint/observation/result refs, recorded usage/timing, unknown outcomes, source digests. Replays recorded results only; never sends an original external operation again.

## simulation-report

- Tasks: V2-T36. Batch: experimental.
- Model: `backend/models/simulation-report.model.js`; factory `createSimulationReportModel({owner,scope,clock})`.
- Record: `SimulationReport`; schema `SimulationReportSchema`; contract source `packages/contracts/src/backend-models/simulation-report.ts`.
- Methods: `appendSimulation`, `getSimulation`. Behavior: append.
- Persistence: simulation_reports. Canonical repository: `backend/modules/control/src/model-repositories/simulation-report.ts`.
- Explicit relational identity/index fields or projection keys: `simulationId`, `candidateVersionRef`, `scenarioSetRef`, `heldOutVersionRef`, `environmentDigest`, `fixedBudgetRef`.
- Required boundary assertions: noLiveEffects=true; pinned inputs/evaluation/candidate; no real account effects.
- Tests: `backend/tests/models/simulation-report.test.js`.
- Source data shape: SimulationRequest: candidateVersionRef, scenarioSetRef, heldOutVersionRef, fixedBudgetRef, fixtureEnvironmentRef, noLiveEffects=true. SimulationReport: scenario/metric results, governance violations, usage, environmentDigest, input/candidate/eval digests, limitations. Candidate cannot write held-out cases or switch to real accounts.

## agent-version

- Tasks: V2-T37. Batch: core.
- Model: `backend/models/agent-version.model.js`; factory `createAgentVersionModel({owner,scope,clock})`.
- Record: `AgentVersionManifest`; schema `AgentVersionManifestSchema`; contract source `packages/contracts/src/backend-models/agent-version.ts`.
- Methods: `appendVersion`, `getVersion`, `listVersions`. Behavior: append.
- Persistence: agent_versions. Canonical repository: `backend/modules/control/src/model-repositories/agent-version.ts`.
- Explicit relational identity/index fields or projection keys: `versionId`, `previousVersionRef`, `compatibilityVersion`, `signerRef`.
- Required boundary assertions: all referenced digests pinned; append never deploys or updates held-out cases.
- Tests: `backend/tests/models/agent-version.test.js`.
- Source data shape: AgentVersionManifest: versionId, prompt/config/model-policy/skills/tools/permission-policy/memory-policy/eval-set digests, compatibilityVersion, previousVersionRef?, signerRef. AgentVersionValidation: valid/rejected plus verifiedDigest and safe issues. A/B/canary/rollback is separately reviewed; signatures do not establish safety.

## agent-release

- Tasks: V2-T38. Batch: experimental.
- Model: `backend/models/agent-release.model.js`; factory `createAgentReleaseModel({owner,scope,clock})`.
- Record: `AgentReleaseReport`; schema `AgentReleaseReportSchema`; contract source `packages/contracts/src/backend-models/agent-release.ts`.
- Methods: `appendReleaseEvaluation`, `getReleaseEvaluation`. Behavior: append.
- Persistence: agent_release_reports. Canonical repository: `backend/modules/control/src/model-repositories/agent-release.ts`.
- Explicit relational identity/index fields or projection keys: `releaseId`, `candidateManifestRef`, `protectedBaselineDigest`, `gateVersion`, `targetEnvironmentRef`, `promotionApprovalRef`.
- Required boundary assertions: eligible/denied is evidence evaluation only; no deployment/promotion mutation.
- Tests: `backend/tests/models/agent-release.test.js`.
- Source data shape: AgentReleaseRequest: candidateManifestRef, immutableEvalReportRefs, protectedBaselineDigest, gateVersion, targetEnvironmentRef, promotionApprovalRef. AgentReleaseReport: eligible/denied, independent gate evidence, signatures, canary/rollback plan refs. Evaluation does not itself deploy or promote.

## model-routing

- Tasks: V2-T39. Batch: reasoning.
- Model: `backend/models/model-routing.model.js`; factory `createModelRoutingModel({owner,scope,clock})`.
- Record: `ModelRoutingDecision`; schema `ModelRoutingDecisionSchema`; contract source `packages/contracts/src/backend-models/model-routing.ts`.
- Methods: `selectApprovedModel`. Behavior: projection.
- Persistence: none: policy/metric projection. No new SQL writer.
- Explicit relational identity/index fields or projection keys: `selectedModelRef`, `privacyEligibility`, `scoreBasis`, `policyDecisionRef`, `budgetReservationRef`.
- Required boundary assertions: privacy before scoring; no forbidden fallback; null selection permitted.
- Tests: `backend/tests/models/model-routing.test.js`.
- Source data shape: ModelRoutingRequest: ModelRequest, taskClass, qualifiedCandidateModelRefs, scoringPolicyVersion, observedMetricRefs. ModelRoutingDecision: selectedModelRef|null, privacyEligibility evidence, scoreBasis, policyDecisionRef, budgetReservationRef, reason. Classify/authorize destination before cost/quality/latency scoring.

## swarm-plan

- Tasks: V2-T40. Batch: experimental.
- Model: `backend/models/swarm-plan.model.js`; factory `createSwarmPlanModel({owner,scope,clock})`.
- Record: `SwarmPlan`; schema `SwarmPlanSchema`; contract source `packages/contracts/src/backend-models/swarm-plan.ts`.
- Methods: `appendSwarmPlan`, `getSwarmPlan`. Behavior: append.
- Persistence: swarm_plans. Canonical repository: `backend/modules/control/src/model-repositories/swarm-plan.ts`.
- Explicit relational identity/index fields or projection keys: `swarmPlanId`, `goalRef`, `planRef`, `reviewedAllocationRef`, `sharedBudgetRef`, `requestedDepth`, `requestedFanOut`.
- Required boundary assertions: depth<=2/fanOut<=8; reduced grants; data model never dispatches swarm.
- Tests: `backend/tests/models/swarm-plan.test.js`.
- Source data shape: SwarmRequest: goalRef, planRef, reviewedAllocationRef, agentVersionRefs, requestedDepth≤2, requestedFanOut≤8, sharedBudgetRef. SwarmPlan: chief/lead/worker assignments, dependency refs, reducedGrantRequests, task/deadline limits. Request limits may be lowered by policy; larger background allocations require a distinct reviewed schedule/scope and never unrestricted peer grants.
