# ASI remaining-task model coverage — proposed

Generated from the current original and V2 ledgers on 2026-10-21. This is a design inventory, not implementation or task completion evidence. Original: 9 pending + 2 blocked; V2: 39 pending. All 50 task IDs are mapped exactly once.

Model names group shared entities. A row is not a new SQL table or a promise of a working feature. `projection` is computed from canonical records; `integration gate` proves composition and adds no public CRUD API. A proposed path is not an existing source file.

| Task | Feature | Domain model | Model treatment | Owner |
| --- | --- | --- | --- | --- |
| 18 | Signed skills | `skill` | reuse/extend | toolRuntime |
| 20 | Slack adapter | `channel-delivery` | reuse/extend | gateway |
| 22 | MCP protocol adapter | `protocol-connection` | adapter metadata | toolRuntime |
| 23 | A2A protocol adapter | `remote-task` | adapter metadata | toolRuntime |
| 24 | Fleet WhatsApp Discord | `fleet-assignment` | new owner metadata | supervisor |
| 25 | Production restore retention release | `restore-report` | release metadata | control |
| 26 | Offline scoped consolidation | `consolidation-candidate` | new owner metadata | memStore |
| 27 | Shadow tool synthesis | `tool-candidate` | new owner metadata | toolRuntime |
| 28 | Optional observations and exchange | `observation` | reuse/extend | memStore |
| 29 | Guarded scaffold evolution | `scaffold-candidate` | new owner metadata | supervisor |
| 30 | Full conformance and handoff | `conformance-report` | integration gate | control |
| V2-T02 | Autonomous Task Decomposition | `task-plan` | reuse/extend | supervisor |
| V2-T03 | Agent Self-Reflection + Critic | `critique-report` | new owner metadata | supervisor |
| V2-T05 | Agent Skill Marketplace | `skill` | reuse/extend | toolRuntime |
| V2-T06 | Dynamic Skill Loading | `skill-selection` | projection | supervisor |
| V2-T07 | Agent Factory | `agent-definition` | new owner metadata | supervisor |
| V2-T08 | Persistent Agents | `agent-lifecycle` | reuse/extend | supervisor |
| V2-T09 | Event-Driven Agents | `trigger` | reuse/extend | gateway |
| V2-T10 | Agent Scheduling | `schedule` | reuse/extend | gateway |
| V2-T11 | Human Approval Gates | `approval-quorum` | reuse/extend | govKernel |
| V2-T12 | Agent Permission Tokens | `resource-grant` | reuse/extend | govKernel |
| V2-T13 | Action Preview / Simulation Mode | `action-preview` | new owner metadata | toolRuntime |
| V2-T14 | Rollback Agent | `compensation-plan` | new owner metadata | supervisor |
| V2-T15 | Self-Healing Agents | `recovery-plan` | projection | supervisor |
| V2-T16 | Agent Reputation System | `worker-score` | reuse/extend | specialists |
| V2-T17 | Agent Competition | `candidate-comparison` | new owner metadata | supervisor |
| V2-T18 | Multi-agent Debate | `debate-report` | new owner metadata | supervisor |
| V2-T19 | Agent Economy / Budget Manager | `budget-allocation` | reuse/extend | govKernel |
| V2-T20 | Context Compiler | `context-bundle` | projection | supervisor |
| V2-T21 | Memory Confidence + Memory Expiration | `memory-lifecycle` | reuse/extend | memStore |
| V2-T22 | Knowledge Graph Memory | `observation` | reuse/extend | memStore |
| V2-T23 | Memory Branches | `memory-branch` | new owner metadata | memStore |
| V2-T24 | Secret Memory | `credential-binding` | opaque handle metadata | govKernel |
| V2-T25 | Long-running Projects | `project` | reuse/extend | supervisor |
| V2-T26 | Agent Workspace | `workspace-lease` | new owner metadata | sandbox |
| V2-T27 | Artifact-first agents | `artifact` | reuse/extend | toolRuntime |
| V2-T28 | Browser / Computer Agent | `specialist-task` | reuse/extend | specialists |
| V2-T29 | Data Analyst Agent | `specialist-task` | reuse/extend | specialists |
| V2-T30 | Coding Agent with full software lifecycle | `specialist-task` | reuse/extend | specialists |
| V2-T31 | Research Agent with Research Graph | `specialist-task` | reuse/extend | specialists |
| V2-T32 | Security Agent | `security-alert` | new owner metadata | specialists |
| V2-T33 | Prompt Injection Firewall | `trust-label` | projection | toolRuntime |
| V2-T34 | AI Decision Ledger | `decision-summary` | projection | govKernel |
| V2-T35 | Time-travel Debugging | `replay-view` | projection | supervisor |
| V2-T36 | Agent Digital Twin / Simulation | `simulation-report` | new owner metadata | supervisor |
| V2-T37 | Agent Versioning | `agent-version` | new owner metadata | supervisor |
| V2-T38 | Agent CI/CD | `agent-release` | release metadata | supervisor |
| V2-T39 | Model Router 2.0 | `model-routing` | projection | privRouter |
| V2-T40 | Agent Swarm Mode | `swarm-plan` | new owner metadata | supervisor |
| V2-G01 | Protected goal-to-artifact V2 workflow | `workflow-evidence` | integration gate | supervisor |

## Per-task data requirements

### 18: Signed skills

- Proposed model entry: `backend/models/skill.model.js`.
- Existing source or persistence basis: skill_versions, skill_installs, skill_trust_records; existing skills verification/install/revoke owner.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R02, R03, R07, R11, R24

### 20: Slack adapter

- Proposed model entry: `backend/models/channel-delivery.model.js`.
- Existing source or persistence basis: ingress_events, delivery_outbox; channel bindings reference opaque credential handles.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R01, R02, R15, R21

### 22: MCP protocol adapter

- Proposed model entry: `backend/models/protocol-connection.model.js`.
- Existing source or persistence basis: existing MCP adapter and identity/effect owners; no new tool execution authority.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R02, R07, R11, R18, R22

### 23: A2A protocol adapter

- Proposed model entry: `backend/models/remote-task.model.js`.
- Existing source or persistence basis: existing A2A remote task state and effect journal; trusted tenant and remote identity bindings.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R02, R06, R11, R12, R18

### 24: Fleet WhatsApp Discord

- Proposed model entry: `backend/models/fleet-assignment.model.js`.
- Existing source or persistence basis: agent assignments referencing canonical tasks, deliveries, grants and budgets.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R01, R06, R08, R12, R14, R21

### 25: Production restore retention release

- Proposed model entry: `backend/models/restore-report.model.js`.
- Existing source or persistence basis: backup/restore/retention reports linked to artifact digests; not a second live database.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R02, R09, R15, R19, R22, R23

### 26: Offline scoped consolidation

- Proposed model entry: `backend/models/consolidation-candidate.model.js`.
- Existing source or persistence basis: memory_records/memory_revisions plus scoped candidate/evaluation provenance.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R05, R09, R10, R11, R14, R16, R23

### 27: Shadow tool synthesis

- Proposed model entry: `backend/models/tool-candidate.model.js`.
- Existing source or persistence basis: immutable tool manifests and held-out evaluation references; no automatic promotion.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R03, R07, R11, R15, R17

### 28: Optional observations and exchange

- Proposed model entry: `backend/models/observation.model.js`.
- Existing source or persistence basis: observations, observation_revisions, observation_exchange; existing SQL is not proof of qualification.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R10, R11, R16, R24

### 29: Guarded scaffold evolution

- Proposed model entry: `backend/models/scaffold-candidate.model.js`.
- Existing source or persistence basis: versioned candidate digest, evaluation and explicit release references.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R02, R03, R07, R14, R15, R17, R24

### 30: Full conformance and handoff

- No standalone model file: integration evidence is assembled from the canonical records.
- Existing source or persistence basis: read-only aggregation of owner qualification evidence; no domain CRUD table.
- Data contract: Reuse existing domain records; original acceptance is defined by the named requirements and the original build plan, rather than a newly invented task-level record.
- Acceptance source: R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24

### V2-T02: Autonomous Task Decomposition

- Proposed model entry: `backend/models/task-plan.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/planner.ts; backend/modules/orchestrator/src/plan-scheduler.ts; packages/contracts/src/v2/feature-02.ts; packages/contracts/src/index.ts.
- Data contract: TaskPlan/PlanStep/PlanValidation/StepOutcome use section 5. Canonical planDigest binds goalRevision and ordered validated steps; scheduler accepts only completed predecessor outcomes and never treats unknown as completed.
- Acceptance source: Reject cycles, bound fan-out, enforce dependencies/cancellation/parent budget; no duplicate effects

### V2-T03: Agent Self-Reflection + Critic

- Proposed model entry: `backend/models/critique-report.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/critic.ts; backend/modules/specialists/src/critic.ts; packages/contracts/src/critique.ts; packages/contracts/src/index.ts.
- Data contract: CritiqueReport: reportId, goalId, goalRevision, taskResultRef, criticId/version, findings[{claimId, category(unsupported/conflict/error/missing_evidence), evidenceRefs, safeSummary}], suggestedPlanRevision?, usage. At most 32 findings and 2 critique rounds per interactive run within inherited iteration/task caps.
- Acceptance source: Critic catches seeded errors; all inference routed; bounded critique cannot grant effect permission

### V2-T05: Agent Skill Marketplace

- Proposed model entry: `backend/models/skill.model.js`.
- Existing source or persistence basis: backend/modules/skills/src/catalog.ts; backend/modules/skills/src/marketplace.ts; packages/contracts/src/skill-catalog.ts; packages/contracts/src/index.ts.
- Data contract: SkillInstallRequest: skillId, version, publisherId, manifestDigest, requestedCapabilityRefs, catalogEntryRef, expectedCatalogRevision. SkillInstallProposal: proposalId, same immutable digest, policyDecisionRef, reviewState(pending/approved/rejected), evalReportRef?, revocationState. Catalog results bound 1–100 entries, authenticated pagination; no executable marketplace payload.
- Acceptance source: Verify digest/signature/provenance, permissions, revocation and evaluation; signature never substitutes for isolation

### V2-T06: Dynamic Skill Loading

- Proposed model entry: `backend/models/skill-selection.model.js`.
- Existing source or persistence basis: backend/modules/skills/src/select.ts; backend/modules/orchestrator/src/skill-context.ts; packages/contracts/src/v2/feature-06.ts; packages/contracts/src/index.ts.
- Data contract: SkillSelectionRequest: taskType, availableSkillRefs, requestedSkillRefs, maxContextTokens, grantRef. QualifiedSkillSelection: sorted skillId/version/digest refs, selectedInstructionRefs, omitted reasons, tokenCount. Selection filters verified/nonrevoked/authorized skills before deterministic ranking; instructions remain distinct from untrusted data.
- Acceptance source: Deterministic selection, bounded context, declared capability checks; no unsigned script import

### V2-T07: Agent Factory

- Proposed model entry: `backend/models/agent-definition.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/agent-factory.ts; backend/modules/specialists/src/definition-registry.ts; packages/contracts/src/agent-definition.ts; packages/contracts/src/index.ts.
- Data contract: AgentDefinitionCandidate: definitionId, roleId, promptArtifactDigest, modelPolicyRef, skillVersionRefs, toolManifestRefs, requestedCapabilityRefs, memoryPolicyRef, evalSetRef. AgentDefinitionProposal: proposalId, candidateDigest, evalReportRef, policyDecisionRef, lifecycle(staged/denied/review_required), versionRef. Never deploy or issue authority on definition validation alone.
- Acceptance source: Human/policy-controlled provisioning, identity isolation, signed version and evaluation; creation cannot expand authority

### V2-T08: Persistent Agents

- Proposed model entry: `backend/models/agent-lifecycle.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/persistent-agents.ts; packages/contracts/src/agent-lifecycle.ts; packages/contracts/src/index.ts.
- Data contract: AgentLifecycleResult: agentId, definitionVersionRef, checkpointRef?, owningRunId?, lifecycle(active/suspended/stopped/revoked/failed), lastTransitionAt, currentGrantRef?, nextScheduleRef?. Persistent agents resume only with current authorization; stop revokes future dispatch and cancels bounded active work.
- Acceptance source: Recover checkpoints after restart, expire grants, stop on revoke, and enforce per-run/background limits

### V2-T09: Event-Driven Agents

- Proposed model entry: `backend/models/trigger.model.js`.
- Existing source or persistence basis: backend/modules/gateway/src/event-ingress.ts; packages/contracts/src/trigger-event.ts; packages/contracts/src/index.ts.
- Data contract: TriggerEvent: schemaVersion, eventId, tenantId (derived by trusted adapter), sourceId, externalEventId, occurredAt, receivedAt, bounded payloadRef, signatureVerificationRef. TriggerAcceptance: acceptedId, duplicate boolean, scheduledRunRef?, status(accepted/rejected/rate_limited). Idempotency keys bind tenant/source/externalEventId and validated digest.
- Acceptance source: Verify signatures, deduplicate, reject forged tenant/events, rate-limit storms; no silent new queue

### V2-T10: Agent Scheduling

- Proposed model entry: `backend/models/schedule.model.js`.
- Existing source or persistence basis: backend/modules/gateway/src/schedules.ts; packages/contracts/src/schedule.ts; packages/contracts/src/index.ts.
- Data contract: ScheduleSpec: scheduleId, tenantId, owningConversationId, goalRef, timezone(IANA), scheduleExpression, missedRunPolicy(skip/run_once), overlapPolicy(skip/queue_one), notificationIntent, version, budgetRef, grantRef. ScheduleRecord adds nextRunAt, lastRunRef?, enabled, policyDecisionRef. DST gaps/overlaps, deletion and downtime have explicit deterministic fixtures; no arbitrary code in expressions.
- Acceptance source: Test missed/duplicate schedules and timezone handling; notify only according to configured intent

### V2-T11: Human Approval Gates

- Proposed model entry: `backend/models/approval-quorum.model.js`.
- Existing source or persistence basis: backend/modules/policy/src/approval-tiers.ts; packages/contracts/src/approval-quorum.ts; packages/contracts/src/index.ts.
- Data contract: ApprovalQuorumRequest: effectRef/inputHash/artifactHash?, policyVersion, proposalVersion, requiredActorRoles, quorumCount, expiresAt, nonceRef. ApprovalQuorumDecision: pending/allowed/denied/expired plus authenticated decisionRefs, exact binding and current epoch. Modification creates a new proposal/version; no client-provided replacement effect args.
- Acceptance source: Bind exact hashes/version/expiry/nonce; modification invalidates approval; no stale/double-use approval

### V2-T12: Agent Permission Tokens

- Proposed model entry: `backend/models/resource-grant.model.js`.
- Existing source or persistence basis: backend/modules/identity/src/resource-grants.ts; packages/contracts/src/resource-grant.ts; packages/contracts/src/index.ts.
- Data contract: ResourceGrantRequest: requested action/resource/audience constraints, expiry, parentGrantRef, delegationDepth. Signed grants bind verified parent lineage, tenant, audience, action and resource selectors; deny unknown/revoked parents, widened selectors and expiry beyond parent. Opaque signing keys remain in identity service.
- Acceptance source: Reject wrong audience, expired/revoked grants and privilege escalation; no raw account secret in payload

### V2-T13: Action Preview / Simulation Mode

- Proposed model entry: `backend/models/action-preview.model.js`.
- Existing source or persistence basis: backend/modules/tools/src/preview.ts; packages/contracts/src/action-preview.ts; packages/contracts/src/index.ts.
- Data contract: ActionPreview: previewId, effectId, inputHash, artifactHash?, simulationReportRef, assumptions, proposedChangesRef, estimatedCostMicroUsd|null, risks, expiresAt, version. Preview uses no-live-effect grants; later execution revalidates current authority and exact reviewed digest.
- Acceptance source: Preview has no live writes; display assumptions; execute only the approved artifact/input

### V2-T14: Rollback Agent

- Proposed model entry: `backend/models/compensation-plan.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/compensation.ts; packages/contracts/src/compensation.ts; packages/contracts/src/index.ts.
- Data contract: CompensationPlan: planId, originalReceiptRef, observedStateRef, supportedActionRefs, irreversibleOutcomes, requiredApprovalRef, expectedStateDigest, boundedDeadline. Every compensation is a new authorized journaled effect; plan cannot promise universal rollback or undo unknown external outcomes automatically.
- Acceptance source: Demonstrate recovery for supported operations; identify irreversible outcomes; compensate only under current authority

### V2-T15: Self-Healing Agents

- Proposed model entry: `backend/models/recovery-plan.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/recovery-plan.ts; packages/contracts/src/recovery-plan.ts; packages/contracts/src/index.ts.
- Data contract: RecoveryInput: failedTaskRef, normalizedError, receiptRef?, currentPlanRef, attemptsAlreadyUsed. RecoveryPlan: retry/reconcile/replan/stop, reasonCode, approvedAlternativeRefs, nextPlanRevision?, maxRemainingAttempts. Unknown external effects select reconcile; retry cap includes previous attempts and excludes forbidden provider fallback.
- Acceptance source: Bound retries; reconcile unknown effects; preserve privacy/authority; alternative route cannot relax restrictions

### V2-T16: Agent Reputation System

- Proposed model entry: `backend/models/worker-score.model.js`.
- Existing source or persistence basis: backend/modules/specialists/src/quality-metrics.ts; backend/modules/specialists/src/rank.ts; packages/contracts/src/worker-score.ts; packages/contracts/src/index.ts.
- Data contract: WorkerScore: workerId, metricVersion, sampleCount, quality/latency/cost/violation aggregates, evidenceRefs, measuredAt, validUntil. RankedWorker: workerId, eligibility, scoreBasis, deterministicRank. Eligibility (health/current grants/capacity/policy) precedes scoring; stale/poisoned samples cannot elevate unsafe workers.
- Acceptance source: Use measured/versioned samples; prevent metric poisoning and unsafe-worker selection; deterministic tie-breaks

### V2-T17: Agent Competition

- Proposed model entry: `backend/models/candidate-comparison.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/competition.ts; packages/contracts/src/candidate-comparison.ts; packages/contracts/src/index.ts.
- Data contract: CandidateComparisonRequest: goalRef, planRef, candidateRefs(2–4), evaluatorVersionRef, budgetRef, noLiveWrites=true. CandidateComparison: winnerRef|null, criterionResults, disagreementSummary, evidenceRefs, usage. Each candidate isolated; judge cannot authorize execution or exceed shared budget.
- Acceptance source: Shared budget; isolated candidates; no duplicate live writes; judge claims require evidence

### V2-T18: Multi-agent Debate

- Proposed model entry: `backend/models/debate-report.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/debate.ts; packages/contracts/src/debate.ts; packages/contracts/src/index.ts.
- Data contract: DebateRequest: proposalArtifactRef, roleRefs(2–4), maxRounds(1–2), successCriteriaRefs, budgetRef. DebateReport: proposalVersionRef, bounded contributions/evidenceRefs, disagreements, recommendations, usage. Two-round debate remains within inherited 8 delegated-task and 12 model-iteration caps.
- Acceptance source: Bound turns; preserve disagreement/provenance; evidence decides acceptance; no policy changes by debate

### V2-T19: Agent Economy / Budget Manager

- Proposed model entry: `backend/models/budget-allocation.model.js`.
- Existing source or persistence basis: backend/modules/budgets/src/optimization.ts; packages/contracts/src/budget-plan.ts; packages/contracts/src/index.ts.
- Data contract: BudgetAllocationRequest: budgetRef, proposedWorkRefs, observedCostRefs, expectedVersion. BudgetAllocationPlan: version, allocations[{workRef,reservedTokens,reservedCostMicroUsd}], unknownUsageRefs, totalReserved. Reservation remains authoritative atomic budget service; optimization cannot exceed approved parent/tenant quotas.
- Acceptance source: Concurrent reservations cannot overspend; reconcile unknown usage; all child spend accounted for

### V2-T20: Context Compiler

- Proposed model entry: `backend/models/context-bundle.model.js`.
- Existing source or persistence basis: backend/modules/context/src/compile.ts; packages/contracts/src/context-bundle.ts; packages/contracts/src/index.ts.
- Data contract: ContextCompileRequest: permittedSourceRefs, goalRef?, taskType, maxContextTokens, stablePrefixRef, requiredToolGroupRefs. ContextBundle: ordered sourceRefs, compiledArtifactRef, prefixHash, tokenCount, omittedRefs/reasons, trustLabels. Preserve complete tool groups and inherited compression thresholds; measure retained-evidence recall.
- Acceptance source: Stable prefix and tool groups survive compression; no unauthorized content; measure recall/token impact

### V2-T21: Memory Confidence + Memory Expiration

- Proposed model entry: `backend/models/memory-lifecycle.model.js`.
- Existing source or persistence basis: backend/modules/memory/src/lifecycle.ts; packages/contracts/src/memory-lifecycle.ts; db/postgres/migrations/012-v2-memory-lifecycle.sql; packages/contracts/src/index.ts.
- Data contract: MemoryLifecycleRevision: memoryId, expectedMemoryVersion, sourceRefs, confidenceBasis, createdAt, verifiedAt?, expiresAt?, contradictionRefs, proposedValueRef?. Existing numeric confidence is preserved with a declared basis. Lifecycle metadata and value revisions use broker authorization/CAS; expired facts cannot outrank verified corrections.
- Acceptance source: Expired/conflicting facts cannot silently outrank verified corrections; preserve provenance/scope

### V2-T22: Knowledge Graph Memory

- Proposed model entry: `backend/models/observation.model.js`.
- Existing source or persistence basis: backend/modules/observations/src/graph-query.ts; packages/contracts/src/graph-query.ts; packages/contracts/src/index.ts.
- Data contract: GraphQuery: permitted scope refs, entityRefs, relationTypes, maxDepth(1–2), limit(1–100), cursor?. GraphResult: scoped observations/relations with sourceRefs, validUntil, revisions, nextCursor. Every traversal hop is tenant/role/private filtered inside existing PostgreSQL observation broker; no new graph database.
- Acceptance source: Apply tenant/role/private checks to graph traversal too; retain relation sources; no new graph DB without ADR

### V2-T23: Memory Branches

- Proposed model entry: `backend/models/memory-branch.model.js`.
- Existing source or persistence basis: backend/modules/memory/src/branches.ts; packages/contracts/src/memory-branch.ts; packages/contracts/src/index.ts.
- Data contract: MemoryBranchQuery: branchId, requestedScopeRefs, queryRef, expectedBranchVersion, limit(1–100). MemoryBranchResult: authorized branch ancestry, matching memoryRefs, versions, nextCursor?. Branch metadata defines parent/expiry/grants; inheritance never widens audience or copies Private facts into Global.
- Acceptance source: Explicit branch grants/inheritance; no wider-scope copy; temporary expiry verified

### V2-T24: Secret Memory

- Proposed model entry: `backend/models/credential-binding.model.js`.
- Existing source or persistence basis: backend/modules/identity/src/credential-handles.ts; backend/modules/tools/src/credential-resolution.ts; packages/contracts/src/credential-handle.ts; packages/contracts/src/index.ts.
- Data contract: CredentialHandleRequest: opaque handleId, verified effectRef, requiredAction/resource/audience, expiry and RunContext. CredentialResolution: opaque executionBindingRef, expiry, allowedTargetDigest. Resolution stays within trusted broker/executor; provider/DB/signing plaintext never reaches model, specialist task, UI or semantic memory.
- Acceptance source: Raw credentials absent from model/payload/browser/logs; expiry/revoke works; broker authority tested

### V2-T25: Long-running Projects

- Proposed model entry: `backend/models/project.model.js`.
- Existing source or persistence basis: backend/modules/control/src/projects.ts; backend/modules/orchestrator/src/project-resume.ts; db/postgres/migrations/013-v2-projects.sql; packages/contracts/src/v2/feature-25.ts; packages/contracts/src/index.ts.
- Data contract: ProjectRecord uses section 5. Restart preserves goal/plan/artifact/blocker refs and current revisions. Completion derives from required verified goals; renewed grants and per-run/project budget govern every resumed operation.
- Acceptance source: Resume safely after restart; show evidence-derived progress; re-authorize new effects and enforce project budget

### V2-T26: Agent Workspace

- Proposed model entry: `backend/models/workspace-lease.model.js`.
- Existing source or persistence basis: backend/modules/sandbox/src/workspace.ts; packages/contracts/src/workspace.ts; infra/sandbox/workspace-profile.json; packages/contracts/src/index.ts.
- Data contract: WorkspaceRequest: workspaceId, agentDefinitionRef, assignedPathRefs, readOnlyMountRefs, allowedDomains, byteQuota, expiresAt, retentionPolicyRef. WorkspaceLease: leaseId, opaque rootRef, validated mount/network profileDigest, expiry, cleanupState. Canonical path and symlink checks prevent escaping assigned roots.
- Acceptance source: Restrict paths/mounts, prevent cross-agent leakage, define retention/cleanup; no host-global filesystem authority

### V2-T27: Artifact-first agents

- Proposed model entry: `backend/models/artifact.model.js`.
- Existing source or persistence basis: backend/modules/tools/src/artifacts.ts; backend/modules/gateway/src/artifact-content.ts; packages/contracts/src/v2/feature-27.ts; packages/contracts/src/index.ts.
- Data contract: ArtifactCandidate: artifactId, tenantId, owningConversationId/runId, mediaType, byteSize, contentRef, sha256, producerVersionRef, sourceEvidenceRefs, validationReportRef, visibilityScope. ArtifactReference remains the existing compatible reference; safe metadata supplies provenance. Publication/export is a separate authorized effect.
- Acceptance source: Artifact exists, validates/renders appropriately, has provenance/digest/access controls; publication separately authorized

### V2-T28: Browser / Computer Agent

- Proposed model entry: `backend/models/specialist-task.model.js`.
- Existing source or persistence basis: backend/modules/specialists/src/browser-agent.ts; backend/modules/tools/src/browser-handler.ts; packages/contracts/src/browser-task.ts; packages/contracts/src/index.ts.
- Data contract: BrowserTask: taskId, goalRef, startingUrl, allowedDomainRefs, sessionProfileRef, permittedActionRefs, upload/downloadRefs, approvalRefs, deadline. Sensitive form submissions require exact policy approval; domain/redirect/file checks apply at execution; returns existing TaskResult evidence and artifacts.
- Acceptance source: Isolated session, domain/file allowlists, injection-resistant authority boundary, exact approval for sensitive submissions

### V2-T29: Data Analyst Agent

- Proposed model entry: `backend/models/specialist-task.model.js`.
- Existing source or persistence basis: backend/modules/specialists/src/data-agent.ts; backend/modules/tools/src/sql-handler.ts; packages/contracts/src/data-task.ts; packages/contracts/src/index.ts.
- Data contract: DataTask: taskId, goalRef, connectionHandleRef, permittedSchemaRefs, queryArtifactRef, readOnly=true by default, row/byte/time limits, analysisCriteriaRefs. SQL parser/resource policy, real database runtime role and read limits precede execution. Output includes reproducible arithmetic and source/result digests; writes require a separate reviewed effect.
- Acceptance source: Read limits and SQL/resource validation; correct arithmetic; uncertainty and causal limits visible

### V2-T30: Coding Agent with full software lifecycle

- Proposed model entry: `backend/models/specialist-task.model.js`.
- Existing source or persistence basis: backend/modules/specialists/src/coding-agent.ts; backend/modules/tools/src/repository-handler.ts; packages/contracts/src/coding-task.ts; packages/contracts/src/index.ts.
- Data contract: CodingTask: taskId, goalRef, repositoryRef, baseCommit, assignedPaths, allowedCommands, branchRef, acceptanceTestRefs, reviewPolicyRef. Branch/test/diff/PR stages are separate effects; no merge/deploy authority implied. Required independent review and scans attach evidence to existing TaskResult.
- Acceptance source: Assigned files, appropriate checks and separate review; no merge/deploy without authority; preserve protected boundaries

### V2-T31: Research Agent with Research Graph

- Proposed model entry: `backend/models/specialist-task.model.js`.
- Existing source or persistence basis: backend/modules/specialists/src/research-agent.ts; packages/contracts/src/research-task.ts; packages/contracts/src/index.ts.
- Data contract: ResearchTask: taskId, goalRef, question, hypothesisRefs, permittedSourceRefs, maxQueries, claimCriteriaRefs, graphMode(disabled/scoped). Results use EvidenceClaim and VerificationReport, source timestamps, contradiction/unknown states. Persistent graph requires original 28 qualification; ordinary research does not silently enable it.
- Acceptance source: Link claims to sources/observed dates; show conflict and unknowns; confidence must have a declared basis

### V2-T32: Security Agent

- Proposed model entry: `backend/models/security-alert.model.js`.
- Existing source or persistence basis: backend/modules/specialists/src/security-monitor.ts; packages/contracts/src/security-alert.ts; packages/contracts/src/index.ts.
- Data contract: SecuritySignalBatch: tenantId, bounded metadata signalRefs(1–100), windowStart/end, detectorVersion. SecurityAlert: alertId, severity, observedAt, evidenceRefs, detectorVersion, signedReceiptRef, safeRecommendation. Monitor can observe/report only; it cannot grant permissions or edit protected policy.
- Acceptance source: Detect seeded threats using safe metadata; signed alerts; monitor cannot rewrite policy or grant itself access

### V2-T33: Prompt Injection Firewall

- Proposed model entry: `backend/models/trust-label.model.js`.
- Existing source or persistence basis: backend/modules/tools/src/untrusted-input.ts; backend/modules/context/src/trust-labels.ts; packages/contracts/src/trust-label.ts; packages/contracts/src/index.ts.
- Data contract: UntrustedInput: inputRef, origin(web/tool/memory/episode/skill/remote), observedDigest, bounded contentRef. TrustLabelledInput: same refs/digest, instructionTrust(untrusted_data), flags, quarantineRef?. Detection false negatives never promote content to authorization; content cannot alter policy or credential scope.
- Acceptance source: Adversarial content cannot authorize effects; detector misses do not grant credentials or bypass policy

### V2-T34: AI Decision Ledger

- Proposed model entry: `backend/models/decision-summary.model.js`.
- Existing source or persistence basis: backend/modules/audit/src/decision-projection.ts; packages/contracts/src/decision-summary.ts; packages/contracts/src/index.ts.
- Data contract: DecisionSummary: decisionId, receiptRef/hash, action/target summaries, evidenceRefs, policyVersion, model/tool version refs, occurredAt, uncertainty, redactionVersion. Principal filtering precedes projection; no secrets, private chain-of-thought or raw provider prompts.
- Acceptance source: Verify receipt/hash bindings and redaction; record uncertainty; exclude private chain-of-thought

### V2-T35: Time-travel Debugging

- Proposed model entry: `backend/models/replay-view.model.js`.
- Existing source or persistence basis: backend/modules/control/src/replay-reader.ts; packages/contracts/src/replay-view.ts; packages/contracts/src/index.ts.
- Data contract: ReplayQuery: tenant-derived principal scope, runId, fromSequence/toSequence, limit(1–100), mode=read_only. ReplayView: ordered checkpoint/observation/result refs, recorded usage/timing, unknown outcomes, source digests. Replays recorded results only; never sends an original external operation again.
- Acceptance source: Replay recorded results in read-only/isolated mode; no re-sending emails/payments; scoped access

### V2-T36: Agent Digital Twin / Simulation

- Proposed model entry: `backend/models/simulation-report.model.js`.
- Existing source or persistence basis: backend/modules/evolution/src/simulation.ts; packages/contracts/src/simulation.ts; evals/cases/v2-simulation.json; packages/contracts/src/index.ts.
- Data contract: SimulationRequest: candidateVersionRef, scenarioSetRef, heldOutVersionRef, fixedBudgetRef, fixtureEnvironmentRef, noLiveEffects=true. SimulationReport: scenario/metric results, governance violations, usage, environmentDigest, input/candidate/eval digests, limitations. Candidate cannot write held-out cases or switch to real accounts.
- Acceptance source: Independent held-out cases, fixed versions/budgets; explicitly separate simulation and live behavior

### V2-T37: Agent Versioning

- Proposed model entry: `backend/models/agent-version.model.js`.
- Existing source or persistence basis: backend/modules/skills/src/agent-version.ts; packages/contracts/src/agent-version.ts; packages/contracts/src/index.ts.
- Data contract: AgentVersionManifest: versionId, prompt/config/model-policy/skills/tools/permission-policy/memory-policy/eval-set digests, compatibilityVersion, previousVersionRef?, signerRef. AgentVersionValidation: valid/rejected plus verifiedDigest and safe issues. A/B/canary/rollback is separately reviewed; signatures do not establish safety.
- Acceptance source: Reproducible digests, authorized A/B exposure, compatibility checks and rollback; no frozen-golden edits

### V2-T38: Agent CI/CD

- Proposed model entry: `backend/models/agent-release.model.js`.
- Existing source or persistence basis: backend/modules/evolution/src/agent-pipeline.ts; packages/contracts/src/agent-release.ts; packages/contracts/src/index.ts; vitest.config.ts.
- Data contract: AgentReleaseRequest: candidateManifestRef, immutableEvalReportRefs, protectedBaselineDigest, gateVersion, targetEnvironmentRef, promotionApprovalRef. AgentReleaseReport: eligible/denied, independent gate evidence, signatures, canary/rollback plan refs. Evaluation does not itself deploy or promote.
- Acceptance source: Independent protected gates, signed artifacts/evidence, reversible rollout; candidate cannot edit its own gate Define the explicit Node release project and require the named release test to be discovered/executed; no jsdom or empty-suite pass substitutes for protected promotion, signed evidence and canary/rollback qualification.

### V2-T39: Model Router 2.0

- Proposed model entry: `backend/models/model-routing.model.js`.
- Existing source or persistence basis: backend/modules/privacy/src/model-scoring.ts; packages/contracts/src/model-routing.ts; packages/contracts/src/index.ts.
- Data contract: ModelRoutingRequest: ModelRequest, taskClass, qualifiedCandidateModelRefs, scoringPolicyVersion, observedMetricRefs. ModelRoutingDecision: selectedModelRef|null, privacyEligibility evidence, scoreBasis, policyDecisionRef, budgetReservationRef, reason. Classify/authorize destination before cost/quality/latency scoring.
- Acceptance source: Privacy eligibility precedes scoring; no forbidden fallback; record selection and observed quality/usage

### V2-T40: Agent Swarm Mode

- Proposed model entry: `backend/models/swarm-plan.model.js`.
- Existing source or persistence basis: backend/modules/orchestrator/src/swarm.ts; packages/contracts/src/swarm.ts; packages/contracts/src/index.ts.
- Data contract: SwarmRequest: goalRef, planRef, reviewedAllocationRef, agentVersionRefs, requestedDepth≤2, requestedFanOut≤8, sharedBudgetRef. SwarmPlan: chief/lead/worker assignments, dependency refs, reducedGrantRequests, task/deadline limits. Request limits may be lowered by policy; larger background allocations require a distinct reviewed schedule/scope and never unrestricted peer grants.
- Acceptance source: Explicit reviewed depth/fan-out/budget limits and allocation; reduced grants; no unrestricted peer delegation

### V2-G01: Protected goal-to-artifact V2 workflow

- No standalone model file: integration evidence is assembled from the canonical records.
- Existing source or persistence basis: backend/workers/gateway/src/main.ts; apps/orchestrator/src/main.ts; backend/modules/gateway/src/ui-v2.ts; backend/modules/orchestrator/src/v2-workflow.ts.
- Data contract: Wire the reviewed GoalSpec/TaskPlan/VerificationReport/ProjectRecord ports through existing authenticated GatewayClient and service composition roots; goal/result events use M06 negotiated projections
- Acceptance source: An approved workload with WorkspaceSession.demoMode=false produces an authorized artifact whose digest/provenance and current success criteria verify; a seeded unsupported claim remains unknown/unmet. Interrupt after effect before receipt, restart, reconcile without duplicate execution, cancel/revoke a child, and deny stale publication. All inference uses privacy, signed receipts verify, runtime-role scope isolation holds, and shared spend remains within the approved workload budget. Actual browser UI shows exact approvals, honest progress and verified versus unmet outcomes. Required unavailable infrastructure fails the live gate.
