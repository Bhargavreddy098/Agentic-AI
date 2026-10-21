import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const json = path => JSON.parse(read(path));
const hash = value => createHash('sha256').update(value).digest('hex');
const write = (path, value) => writeFileSync(resolve(root, path), value, 'utf8');
const guidePath = 'docs/v2-build-guide.md';
const ledgerPath = 'docs/v2-task-ledger.json';
const manifestPath = 'docs/v2-source-manifest.json';
const marker = '<!-- V2 GENERATED APPENDICES -->';
const core = read(guidePath).split(marker)[0] + marker + '\n';
const system = json('docs/task-ledger.json');
const ui = json('docs/ui-task-ledger.json');
const fileList = execFileSync('rg', ['--files', '-g', '*.md'], {cwd: root, encoding: 'utf8'}).trim().split(/\r?\n/).map(path => path.replaceAll('\\', '/')).filter(path => path !== guidePath).sort();
const sources = [...fileList, 'docs/architecture-baseline.json', 'docs/ui-baseline.json', 'docs/task-ledger.json', 'docs/ui-task-ledger.json', 'docs/dependency-inventory.json', 'docs/ui-component-inventory.json'];
const sourceSnapshots = sources.map(path => ({path, text: read(path)}));
const proposalRows = read('docs/architecture-v2-agent-reference.md').split(/\r?\n/).filter(line => /^\| V2-F\d{2} ·/.test(line)).map(line => {
  const [label, meaning, anchors, acceptance] = line.split('|').slice(1,5).map(value => value.trim());
  const [,number,title] = label.match(/^V2-F(\d{2}) · (.*)$/);
  const original = new Set();
  const anchorText = anchors.split(';')[0];
  for (const match of anchorText.matchAll(/\b(\d{2})(?:[–-](\d{2}))?\b/g)) {
    for (let value = Number(match[1]); value <= Number(match[2] ?? match[1]); value++) original.add(String(value).padStart(2,'0'));
  }
  return {number, id: `V2-F${number}`, title, meaning, anchors, acceptance, originalDependencies:[...original]};
});
if (proposalRows.length !== 40) throw new Error('Expected exactly 40 proposal source rows');

// Fields: owner; exact product files; exact proposed boundary port; extension deps; phase.
const features = [
 ['supervisor','backend/modules/orchestrator/src/goals.ts;backend/modules/control/src/goals.ts;backend/database/migrations/postgres/011-v2-goals.sql','createGoal(input: GoalSpec, context: RunContext): Promise<GoalRecord>; reviseGoal(input: GoalSpec, expectedRevision: number, context: RunContext): Promise<GoalRecord>','04','first-workflow'],
 ['supervisor','backend/modules/orchestrator/src/planner.ts;backend/modules/orchestrator/src/plan-scheduler.ts','validatePlan(plan: TaskPlan, goal: GoalRecord): PlanValidation; nextReadySteps(plan: TaskPlan, outcomes: StepOutcome[], context: RunContext): PlanStep[]','01','first-workflow'],
 ['supervisor','backend/modules/orchestrator/src/critic.ts;backend/modules/specialists/src/critic.ts;packages/contracts/src/critique.ts','critiqueResult(result: TaskResult, goal: GoalRecord, context: RunContext): Promise<CritiqueReport>','01,02,04','first-workflow'],
 ['supervisor','backend/modules/orchestrator/src/verification.ts;backend/modules/tools/src/artifact-provenance.ts','verifyGoal(goal: GoalRecord, evidence: EvidenceClaim[], context: RunContext): Promise<VerificationReport>','','first-workflow'],
 ['toolRuntime','backend/modules/skills/src/catalog.ts;backend/modules/skills/src/marketplace.ts;packages/contracts/src/skill-catalog.ts','proposeSkillInstall(input: SkillInstallRequest, context: RunContext): Promise<SkillInstallProposal>','06,37','advanced'],
 ['supervisor','backend/modules/skills/src/select.ts;backend/modules/orchestrator/src/skill-context.ts','selectSkills(request: SkillSelectionRequest, context: RunContext): Promise<QualifiedSkillSelection>','20','useful'],
 ['supervisor','backend/modules/orchestrator/src/agent-factory.ts;backend/modules/specialists/src/definition-registry.ts;packages/contracts/src/agent-definition.ts','proposeAgentDefinition(input: AgentDefinitionCandidate, context: RunContext): Promise<AgentDefinitionProposal>','12,37,38','advanced'],
 ['supervisor','backend/modules/orchestrator/src/persistent-agents.ts;packages/contracts/src/agent-lifecycle.ts','resumePersistentAgent(agentId: string, context: RunContext): Promise<AgentLifecycleResult>','10,12,25','advanced'],
 ['gateway','backend/modules/gateway/src/event-ingress.ts;packages/contracts/src/trigger-event.ts','acceptTrigger(event: TriggerEvent, principal: Principal): Promise<TriggerAcceptance>','08','advanced'],
 ['gateway','backend/modules/gateway/src/schedules.ts;packages/contracts/src/schedule.ts','scheduleJob(input: ScheduleSpec, context: RunContext): Promise<ScheduleRecord>','01','useful'],
 ['govKernel','backend/modules/policy/src/approval-tiers.ts;packages/contracts/src/approval-quorum.ts;apps/web/src/features/chat/cards/ApprovalCard.tsx','evaluateApprovalQuorum(input: ApprovalQuorumRequest, context: RunContext): Promise<ApprovalQuorumDecision>','12,34','advanced'],
 ['govKernel','backend/modules/identity/src/resource-grants.ts;packages/contracts/src/resource-grant.ts','delegateResourceGrant(parent: Principal, request: ResourceGrantRequest): Promise<string>','','useful'],
 ['toolRuntime','backend/modules/tools/src/preview.ts;packages/contracts/src/action-preview.ts;apps/web/src/features/chat/cards/ActionPreviewCard.tsx','previewAction(request: EffectRequest, context: RunContext): Promise<ActionPreview>','11,26,36','advanced'],
 ['supervisor','backend/modules/orchestrator/src/compensation.ts;packages/contracts/src/compensation.ts','proposeCompensation(receipt: AuditReceipt, context: RunContext): Promise<CompensationPlan>','11,15,35','advanced'],
 ['supervisor','backend/modules/orchestrator/src/recovery-plan.ts;packages/contracts/src/recovery-plan.ts','proposeRecovery(input: RecoveryInput, context: RunContext): Promise<RecoveryPlan>','02,04','useful'],
 ['specialists','backend/modules/specialists/src/quality-metrics.ts;backend/modules/specialists/src/rank.ts;packages/contracts/src/worker-score.ts','rankWorkers(workers: WorkerDescriptor[], scores: WorkerScore[]): RankedWorker[]','04','advanced'],
 ['supervisor','backend/modules/orchestrator/src/competition.ts;packages/contracts/src/candidate-comparison.ts','compareCandidates(input: CandidateComparisonRequest, context: RunContext): Promise<CandidateComparison>','03,16,19','advanced'],
 ['supervisor','backend/modules/orchestrator/src/debate.ts;packages/contracts/src/debate.ts','runDebate(input: DebateRequest, context: RunContext): Promise<DebateReport>','03,19','advanced'],
 ['govKernel','backend/modules/budgets/src/optimization.ts;packages/contracts/src/budget-plan.ts','proposeBudgetAllocation(request: BudgetAllocationRequest, context: RunContext): Promise<BudgetAllocationPlan>','','useful'],
 ['supervisor','backend/modules/context/src/compile.ts;packages/contracts/src/context-bundle.ts','compileContext(request: ContextCompileRequest, context: RunContext): Promise<ContextBundle>','','useful'],
 ['memStore','backend/modules/memory/src/lifecycle.ts;packages/contracts/src/memory-lifecycle.ts;backend/database/migrations/postgres/012-v2-memory-lifecycle.sql','reviseMemoryLifecycle(input: MemoryLifecycleRevision, context: RunContext): Promise<MemoryRecord>','','useful'],
 ['memStore','packages/observations/src/graph-query.ts;packages/contracts/src/graph-query.ts','queryKnowledgeGraph(input: GraphQuery, context: RunContext): Promise<GraphResult>','21','experimental'],
 ['memStore','backend/modules/memory/src/branches.ts;packages/contracts/src/memory-branch.ts','queryMemoryBranch(input: MemoryBranchQuery, context: RunContext): Promise<MemoryBranchResult>','21,22','experimental'],
 ['govKernel','backend/modules/identity/src/credential-handles.ts;backend/modules/tools/src/credential-resolution.ts;packages/contracts/src/credential-handle.ts','resolveCredentialHandle(input: CredentialHandleRequest, context: RunContext): Promise<CredentialResolution>','12','useful'],
 ['supervisor','backend/modules/control/src/projects.ts;backend/modules/orchestrator/src/project-resume.ts;backend/database/migrations/postgres/013-v2-projects.sql','saveProject(project: ProjectRecord, expectedVersion: number, context: RunContext): Promise<ProjectRecord>','01,02,04','first-workflow'],
 ['sandbox','backend/modules/sandbox/src/workspace.ts;packages/contracts/src/workspace.ts;infra/sandbox/workspace-profile.json','prepareWorkspace(input: WorkspaceRequest, context: RunContext): Promise<WorkspaceLease>','12,24','advanced'],
 ['toolRuntime','backend/modules/tools/src/artifacts.ts;backend/modules/gateway/src/artifact-content.ts;apps/web/src/features/chat/cards/ArtifactCard.tsx','publishArtifact(input: ArtifactCandidate, context: RunContext): Promise<ArtifactReference>','01,02,03,04,25','first-workflow'],
 ['specialists','backend/modules/specialists/src/browser-agent.ts;backend/modules/tools/src/browser-handler.ts;packages/contracts/src/browser-task.ts','runBrowserTask(input: BrowserTask, context: RunContext): Promise<TaskResult>','12,24,26,33','specialists'],
 ['specialists','backend/modules/specialists/src/data-agent.ts;backend/modules/tools/src/sql-handler.ts;packages/contracts/src/data-task.ts','runDataTask(input: DataTask, context: RunContext): Promise<TaskResult>','04,12,27','specialists'],
 ['specialists','backend/modules/specialists/src/coding-agent.ts;backend/modules/tools/src/repository-handler.ts;packages/contracts/src/coding-task.ts','runCodingTask(input: CodingTask, context: RunContext): Promise<TaskResult>','04,06,26,27','specialists'],
 ['specialists','backend/modules/specialists/src/research-agent.ts;packages/contracts/src/research-task.ts','runResearchTask(input: ResearchTask, context: RunContext): Promise<TaskResult>','04,27','specialists'],
 ['specialists','backend/modules/specialists/src/security-monitor.ts;packages/contracts/src/security-alert.ts','inspectSecuritySignals(input: SecuritySignalBatch, context: RunContext): Promise<SecurityAlert[]>','09,34','specialists'],
 ['toolRuntime','backend/modules/tools/src/untrusted-input.ts;backend/modules/context/src/trust-labels.ts;packages/contracts/src/trust-label.ts','labelUntrustedInput(input: UntrustedInput): TrustLabelledInput','','specialists'],
 ['govKernel','backend/modules/audit/src/decision-projection.ts;packages/contracts/src/decision-summary.ts;apps/web/src/features/chat/cards/DecisionSummary.tsx','projectDecision(receipt: AuditReceipt, principal: Principal): Promise<DecisionSummary>','','specialists'],
 ['supervisor','backend/modules/control/src/replay-reader.ts;packages/contracts/src/replay-view.ts;apps/web/src/features/activity/ReplayViewer.tsx','readReplay(input: ReplayQuery, principal: Principal): Promise<ReplayView>','34','specialists'],
 ['supervisor','packages/evolution/src/simulation.ts;packages/contracts/src/simulation.ts;evals/cases/v2-simulation.json','simulateCandidate(input: SimulationRequest, context: RunContext): Promise<SimulationReport>','04,35,37','experimental'],
 ['supervisor','backend/modules/skills/src/agent-version.ts;packages/contracts/src/agent-version.ts','validateAgentVersion(input: AgentVersionManifest): AgentVersionValidation','','experimental'],
 ['supervisor','packages/evolution/src/agent-pipeline.ts;packages/contracts/src/agent-release.ts;tests/release/v2-agent-pipeline.test.ts','evaluateAgentRelease(input: AgentReleaseRequest, context: RunContext): Promise<AgentReleaseReport>','04,37','experimental'],
 ['privRouter','backend/modules/privacy/src/model-scoring.ts;packages/contracts/src/model-routing.ts','selectApprovedModel(input: ModelRoutingRequest, context: RunContext): Promise<ModelRoutingDecision>','19','useful'],
 ['supervisor','backend/modules/orchestrator/src/swarm.ts;packages/contracts/src/swarm.ts','planSwarm(input: SwarmRequest, context: RunContext): Promise<SwarmPlan>','02,07,12,16,19,38','experimental'],
];

const migrationData = [
 ['01','V2 traceability and baseline review','govKernel','docs/architecture-baseline.json;AGENTS.md;docs/v2-build-guide.md;docs/v2-task-ledger.json;docs/v2-source-manifest.json;scripts/assemble-v2-guide.mjs;scripts/verify-v2-guide.mjs;scripts/v2-task.mjs;scripts/v2-task-state.mjs;scripts/v2-task-state.test.mjs;scripts/verify-traceability.mjs;tests/architecture/v2-traceability.test.ts','Preserve all 52 original task IDs and R/F coverage; supplement with a reviewed V2 namespace; baseline review is required before promoting new mappings.','Validated task mappings and strict coverage for original plus V2 namespaces','', 'Verify duplicate/unknown/unmapped feature IDs and cycles fail; original 52-task deletion still fails.'],
 ['02','Core V2 contracts and compatibility','govKernel','packages/contracts/src/goal.ts;packages/contracts/src/plan.ts;packages/contracts/src/evidence.ts;packages/contracts/src/project.ts;packages/contracts/src/index.ts;packages/contracts/test/v2-contracts.test.ts;packages/contracts/test/compatibility.test.ts','Add the proposed GoalSpec/GoalRecord/TaskPlan/EvidenceClaim/VerificationReport/ProjectRecord exports; preserve old wire schemas and test any reviewed optional links.','Schemas and inferred types named in section 5; existing TaskEnvelope/TaskResult/RunContext preserved','M01','Reject cycles at plan validation; malformed dates, tenants, unbounded fields and lost old fixture compatibility fail. Product V2 never forces schemaVersion=2.'],
 ['03','Identity correctness and durable grant qualification','govKernel','backend/modules/identity/src/verify.ts;backend/modules/identity/src/token.ts;backend/modules/identity/src/delegate.ts;backend/modules/identity/src/revoke.ts;backend/modules/identity/src/config.ts;backend/modules/identity/src/postgres-grant-store.ts;backend/database/migrations/postgres/009-identity-grants.sql;backend/modules/identity/test/grants.test.ts;tests/security/credentials.test.ts','Reproduce grant/role/agentId round-trip, unknown/revoked/expired grant denial and restart behavior; qualify durable revocation and reduced delegation without exposing secrets. Do not claim an absent service image/mount test passed.','Keep verifyPrincipal/delegatePrincipal ports; review GrantStore durability and parent-revocation semantics','M02','Cryptographic/schema/issuer/audience/key validity verified; durable revocation survives restart; child cannot widen resource scope or outlive revoked parent; no secret in payload/mount/log.'],
 ['04','Durable control correctness and recovery qualification','govKernel','backend/modules/control/src/ingress.ts;backend/modules/control/src/leases.ts;backend/modules/control/src/outbox.ts;backend/modules/control/src/checkpoints.ts;backend/modules/control/src/effects.ts;backend/database/migrations/postgres/001-control.sql;backend/database/migrations/postgres/010-control-qualification.sql;tests/integration/control-v2-qualification.test.ts;vitest.config.ts','Reproduce lossless checkpoint context, missing uniqueness, stale writes/lease takeover, tenant outbox binding, transactional ingress/dispatch and retry issues on a clean disposable PostgreSQL database. Preserve historical evidence; do not rewrite deployed migrations silently.','Keep existing control repository ports; review tenant/epoch CAS, server-time lease and append-only checkpoint-history semantics','M03','Competing owners cannot overwrite a live lease; session epoch increases across different runs; expired/stale writes denied; checkpoint round-trip preserves original context; runtime-role RLS; crash/retry preserves one logical dispatch.'],
 ['U01','Presentation stack reuse qualification','channels','docs/ui-component-inventory.json;packages/ui/src/adapters/chat.ts;packages/ui/src/adapters/primitives.ts;packages/ui/src/index.ts;tests/ui/source-boundaries.test.ts','Reuse the approved stack and all eleven inventory sources; qualify only newly needed wrappers. No replacement library or registry-wide install.','Project wrappers remain the only feature-facing vendor boundary','M01','Source/license/digest checks pass; direct vendor imports and multiple state owners are rejected; if no new wrapper is needed record qualified reuse.'],
 ['U02','Safe V2 UI contracts and one client','channels','packages/contracts/src/ui/index.ts;apps/web/src/lib/gateway/client.ts;apps/web/src/lib/gateway/http-client.ts;tests/ui/contracts/v2-schemas.test.ts;tests/ui/contracts/harness.ts','Add section 6 safe projections/events after core-schema review; publish one contract harness for fixture and real Gateway.','GoalView/PlanView/VerificationView/ProjectView and approved new UiEvent variants; existing GatewayClient methods remain compatible','M02,M05','Wrong-conversation/tenant projections, raw secrets, invalid versions/events and stale commands reject; old snapshots remain parseable; client uses same Gateway.'],
 ['U03','V2 simulated Gateway scenarios','gateway','apps/gateway-fixture/src/main.ts;apps/gateway-fixture/src/scenarios.ts;tests/ui/contracts/v2-mock-gateway.test.ts','Use actual existing fixture paths after inventory; add bounded goal→plan→artifact→verification, unknown criterion, restart/replay and budget/cancel scenarios.','Shared M06 UI DTOs/events; runGatewayContractTests remains a fixture/live contract harness','M06','Real loopback HTTP/SSE tests recover identical canonical snapshots; synthetic outcomes stay Demo; fixture refuses production and never uses accounts.'],
 ['U04','Seven-section shell and navigation reuse','channels','apps/web/src/features/shell/AppShell.tsx;apps/web/src/lib/navigation.ts;tests/ui/navigation.test.ts','Retain seven labels/order/routes; any goal/project/replay panel is secondary and links to its owning conversation.','Existing navigateToInteraction and AppShell; no new primary navigation interface','M07','Exactly seven sections; management and Activity route to owning Chat; no new approval/agent page. Qualified reuse may require no source edits.'],
 ['U05','Canonical V2 event and replay ownership','channels','apps/web/src/lib/chat/store.ts;apps/web/src/lib/chat/reducer.ts;tests/ui/state/v2-reducer.test.ts;tests/ui/state/reconnect.test.ts','Extend only the existing store/reducer for approved V2 projections; maintain bounded retries, dedup, ordering, revision guards and logout clearing.','hydrateConversation/reduceConversation consume M06 schemas; one WorkspaceProvider/ChatStore','M06,M07,M08','Duplicate/out-of-order/new projection versions never regress results; gap reload reproduces snapshot; tenant/logout/navigation abort and clear sensitive state.'],
 ['U06','Composer compatibility and goal intent','channels','apps/web/src/features/chat/Composer.tsx;apps/web/src/lib/chat/submission.ts;apps/web/src/lib/chat/uploads.ts;tests/ui/chat/v2-composer.test.ts','Keep text/attachments/model/skills transport; structured goal controls only after reviewed M06 capability support. Unsupported controls unavailable.','Existing SendMessageInput and store-owned submission/cancel identities; any new goal intent is schema-defined','M09','IME/navigation/retry IDs/upload quarantine/cancellation still pass; no client-built authorization or premature submission of unsupported goals. Qualified reuse is valid.'],
 ['U07','Canonical message rendering repair and V2 evidence','channels','apps/web/src/features/chat/ChatFrame.tsx;apps/web/src/features/chat/ConversationPanel.tsx;apps/web/src/features/chat/MessageRenderer.tsx;apps/web/src/features/chat/SafeMarkdown.tsx;apps/web/src/features/chat/markdown.ts;tests/ui/chat/messages.test.tsx;tests/ui/e2e/v2-messages.spec.ts','Repair named/default export and props mismatch; render canonical UiMessage parts rather than an alternate Message runtime. Audit skipped tests and qualify the actual Chat route before adding V2 evidence views.','ChatFrame snapshot→ConversationPanel→UiMessage parts through qualified wrappers; cards resolve authoritative references','M09,M10','Strict UI build/types; actual browser Chat displays canonical stream/citations/references; safe links/no raw scripts; bottom-follow/scroll-up/accessibility; all required skipped cases reinstated or explicitly blocking.'],
];

const migrations = migrationData.map((row,index) => {
  const [originalTask,title,owner,paths,delta,interfaces,deps,acceptance] = row;
  const original = [...system.tasks,...ui.tasks].find(task => task.id === originalTask);
  return {id:`M${String(index+1).padStart(2,'0')}`,title,kind:'migration',originalTask,owner,requirements: original.requirements,proposalIds:[],status:'pending',reviewStatus:'pending',dependsOn:deps ? deps.split(','):[],originalDependencies:[originalTask],files:paths.split(';'),interfaces,delta,acceptance,checks:[index===3 ? 'pnpm exec vitest run --project integration tests/integration/control-v2-qualification.test.ts' : index===2 ? 'pnpm exec vitest run --project unit backend/modules/identity/test/grants.test.ts' : index===10 ? 'pnpm ui:typecheck' : 'node scripts/verify-v2-guide.mjs'], evidence:[]};
});

const contractShapes = [
 'GoalSpec/GoalRecord use section 5. Goal transitions use expectedRevision, current RunContext and a matching VerificationReport; final verified is denied if a required criterion is unknown or unsatisfied.',
 'TaskPlan/PlanStep/PlanValidation/StepOutcome use section 5. Canonical planDigest binds goalRevision and ordered validated steps; scheduler accepts only completed predecessor outcomes and never treats unknown as completed.',
 'CritiqueReport: reportId, goalId, goalRevision, taskResultRef, criticId/version, findings[{claimId, category(unsupported/conflict/error/missing_evidence), evidenceRefs, safeSummary}], suggestedPlanRevision?, usage. At most 32 findings and 2 critique rounds per interactive run within inherited iteration/task caps.',
 'EvidenceClaim/VerificationReport use section 5. Material claims have source and observed/verification times; criterion IDs must match the current GoalSpec exactly. Verification is bound to plan/artifact digests; unknown evidence yields unknown, not satisfied.',
 'SkillInstallRequest: skillId, version, publisherId, manifestDigest, requestedCapabilityRefs, catalogEntryRef, expectedCatalogRevision. SkillInstallProposal: proposalId, same immutable digest, policyDecisionRef, reviewState(pending/approved/rejected), evalReportRef?, revocationState. Catalog results bound 1–100 entries, authenticated pagination; no executable marketplace payload.',
 'SkillSelectionRequest: taskType, availableSkillRefs, requestedSkillRefs, maxContextTokens, grantRef. QualifiedSkillSelection: sorted skillId/version/digest refs, selectedInstructionRefs, omitted reasons, tokenCount. Selection filters verified/nonrevoked/authorized skills before deterministic ranking; instructions remain distinct from untrusted data.',
 'AgentDefinitionCandidate: definitionId, roleId, promptArtifactDigest, modelPolicyRef, skillVersionRefs, toolManifestRefs, requestedCapabilityRefs, memoryPolicyRef, evalSetRef. AgentDefinitionProposal: proposalId, candidateDigest, evalReportRef, policyDecisionRef, lifecycle(staged/denied/review_required), versionRef. Never deploy or issue authority on definition validation alone.',
 'AgentLifecycleResult: agentId, definitionVersionRef, checkpointRef?, owningRunId?, lifecycle(active/suspended/stopped/revoked/failed), lastTransitionAt, currentGrantRef?, nextScheduleRef?. Persistent agents resume only with current authorization; stop revokes future dispatch and cancels bounded active work.',
 'TriggerEvent: schemaVersion, eventId, tenantId (derived by trusted adapter), sourceId, externalEventId, occurredAt, receivedAt, bounded payloadRef, signatureVerificationRef. TriggerAcceptance: acceptedId, duplicate boolean, scheduledRunRef?, status(accepted/rejected/rate_limited). Idempotency keys bind tenant/source/externalEventId and validated digest.',
 'ScheduleSpec: scheduleId, tenantId, owningConversationId, goalRef, timezone(IANA), scheduleExpression, missedRunPolicy(skip/run_once), overlapPolicy(skip/queue_one), notificationIntent, version, budgetRef, grantRef. ScheduleRecord adds nextRunAt, lastRunRef?, enabled, policyDecisionRef. DST gaps/overlaps, deletion and downtime have explicit deterministic fixtures; no arbitrary code in expressions.',
 'ApprovalQuorumRequest: effectRef/inputHash/artifactHash?, policyVersion, proposalVersion, requiredActorRoles, quorumCount, expiresAt, nonceRef. ApprovalQuorumDecision: pending/allowed/denied/expired plus authenticated decisionRefs, exact binding and current epoch. Modification creates a new proposal/version; no client-provided replacement effect args.',
 'ResourceGrantRequest: requested action/resource/audience constraints, expiry, parentGrantRef, delegationDepth. Signed grants bind verified parent lineage, tenant, audience, action and resource selectors; deny unknown/revoked parents, widened selectors and expiry beyond parent. Opaque signing keys remain in identity service.',
 'ActionPreview: previewId, effectId, inputHash, artifactHash?, simulationReportRef, assumptions, proposedChangesRef, estimatedCostMicroUsd|null, risks, expiresAt, version. Preview uses no-live-effect grants; later execution revalidates current authority and exact reviewed digest.',
 'CompensationPlan: planId, originalReceiptRef, observedStateRef, supportedActionRefs, irreversibleOutcomes, requiredApprovalRef, expectedStateDigest, boundedDeadline. Every compensation is a new authorized journaled effect; plan cannot promise universal rollback or undo unknown external outcomes automatically.',
 'RecoveryInput: failedTaskRef, normalizedError, receiptRef?, currentPlanRef, attemptsAlreadyUsed. RecoveryPlan: retry/reconcile/replan/stop, reasonCode, approvedAlternativeRefs, nextPlanRevision?, maxRemainingAttempts. Unknown external effects select reconcile; retry cap includes previous attempts and excludes forbidden provider fallback.',
 'WorkerScore: workerId, metricVersion, sampleCount, quality/latency/cost/violation aggregates, evidenceRefs, measuredAt, validUntil. RankedWorker: workerId, eligibility, scoreBasis, deterministicRank. Eligibility (health/current grants/capacity/policy) precedes scoring; stale/poisoned samples cannot elevate unsafe workers.',
 'CandidateComparisonRequest: goalRef, planRef, candidateRefs(2–4), evaluatorVersionRef, budgetRef, noLiveWrites=true. CandidateComparison: winnerRef|null, criterionResults, disagreementSummary, evidenceRefs, usage. Each candidate isolated; judge cannot authorize execution or exceed shared budget.',
 'DebateRequest: proposalArtifactRef, roleRefs(2–4), maxRounds(1–2), successCriteriaRefs, budgetRef. DebateReport: proposalVersionRef, bounded contributions/evidenceRefs, disagreements, recommendations, usage. Two-round debate remains within inherited 8 delegated-task and 12 model-iteration caps.',
 'BudgetAllocationRequest: budgetRef, proposedWorkRefs, observedCostRefs, expectedVersion. BudgetAllocationPlan: version, allocations[{workRef,reservedTokens,reservedCostMicroUsd}], unknownUsageRefs, totalReserved. Reservation remains authoritative atomic budget service; optimization cannot exceed approved parent/tenant quotas.',
 'ContextCompileRequest: permittedSourceRefs, goalRef?, taskType, maxContextTokens, stablePrefixRef, requiredToolGroupRefs. ContextBundle: ordered sourceRefs, compiledArtifactRef, prefixHash, tokenCount, omittedRefs/reasons, trustLabels. Preserve complete tool groups and inherited compression thresholds; measure retained-evidence recall.',
 'MemoryLifecycleRevision: memoryId, expectedMemoryVersion, sourceRefs, confidenceBasis, createdAt, verifiedAt?, expiresAt?, contradictionRefs, proposedValueRef?. Existing numeric confidence is preserved with a declared basis. Lifecycle metadata and value revisions use broker authorization/CAS; expired facts cannot outrank verified corrections.',
 'GraphQuery: permitted scope refs, entityRefs, relationTypes, maxDepth(1–2), limit(1–100), cursor?. GraphResult: scoped observations/relations with sourceRefs, validUntil, revisions, nextCursor. Every traversal hop is tenant/role/private filtered inside existing PostgreSQL observation broker; no new graph database.',
 'MemoryBranchQuery: branchId, requestedScopeRefs, queryRef, expectedBranchVersion, limit(1–100). MemoryBranchResult: authorized branch ancestry, matching memoryRefs, versions, nextCursor?. Branch metadata defines parent/expiry/grants; inheritance never widens audience or copies Private facts into Global.',
 'CredentialHandleRequest: opaque handleId, verified effectRef, requiredAction/resource/audience, expiry and RunContext. CredentialResolution: opaque executionBindingRef, expiry, allowedTargetDigest. Resolution stays within trusted broker/executor; provider/DB/signing plaintext never reaches model, specialist task, UI or semantic memory.',
 'ProjectRecord uses section 5. Restart preserves goal/plan/artifact/blocker refs and current revisions. Completion derives from required verified goals; renewed grants and per-run/project budget govern every resumed operation.',
 'WorkspaceRequest: workspaceId, agentDefinitionRef, assignedPathRefs, readOnlyMountRefs, allowedDomains, byteQuota, expiresAt, retentionPolicyRef. WorkspaceLease: leaseId, opaque rootRef, validated mount/network profileDigest, expiry, cleanupState. Canonical path and symlink checks prevent escaping assigned roots.',
 'ArtifactCandidate: artifactId, tenantId, owningConversationId/runId, mediaType, byteSize, contentRef, sha256, producerVersionRef, sourceEvidenceRefs, validationReportRef, visibilityScope. ArtifactReference remains the existing compatible reference; safe metadata supplies provenance. Publication/export is a separate authorized effect.',
 'BrowserTask: taskId, goalRef, startingUrl, allowedDomainRefs, sessionProfileRef, permittedActionRefs, upload/downloadRefs, approvalRefs, deadline. Sensitive form submissions require exact policy approval; domain/redirect/file checks apply at execution; returns existing TaskResult evidence and artifacts.',
 'DataTask: taskId, goalRef, connectionHandleRef, permittedSchemaRefs, queryArtifactRef, readOnly=true by default, row/byte/time limits, analysisCriteriaRefs. SQL parser/resource policy, real database runtime role and read limits precede execution. Output includes reproducible arithmetic and source/result digests; writes require a separate reviewed effect.',
 'CodingTask: taskId, goalRef, repositoryRef, baseCommit, assignedPaths, allowedCommands, branchRef, acceptanceTestRefs, reviewPolicyRef. Branch/test/diff/PR stages are separate effects; no merge/deploy authority implied. Required independent review and scans attach evidence to existing TaskResult.',
 'ResearchTask: taskId, goalRef, question, hypothesisRefs, permittedSourceRefs, maxQueries, claimCriteriaRefs, graphMode(disabled/scoped). Results use EvidenceClaim and VerificationReport, source timestamps, contradiction/unknown states. Persistent graph requires original 28 qualification; ordinary research does not silently enable it.',
 'SecuritySignalBatch: tenantId, bounded metadata signalRefs(1–100), windowStart/end, detectorVersion. SecurityAlert: alertId, severity, observedAt, evidenceRefs, detectorVersion, signedReceiptRef, safeRecommendation. Monitor can observe/report only; it cannot grant permissions or edit protected policy.',
 'UntrustedInput: inputRef, origin(web/tool/memory/episode/skill/remote), observedDigest, bounded contentRef. TrustLabelledInput: same refs/digest, instructionTrust(untrusted_data), flags, quarantineRef?. Detection false negatives never promote content to authorization; content cannot alter policy or credential scope.',
 'DecisionSummary: decisionId, receiptRef/hash, action/target summaries, evidenceRefs, policyVersion, model/tool version refs, occurredAt, uncertainty, redactionVersion. Principal filtering precedes projection; no secrets, private chain-of-thought or raw provider prompts.',
 'ReplayQuery: tenant-derived principal scope, runId, fromSequence/toSequence, limit(1–100), mode=read_only. ReplayView: ordered checkpoint/observation/result refs, recorded usage/timing, unknown outcomes, source digests. Replays recorded results only; never sends an original external operation again.',
 'SimulationRequest: candidateVersionRef, scenarioSetRef, heldOutVersionRef, fixedBudgetRef, fixtureEnvironmentRef, noLiveEffects=true. SimulationReport: scenario/metric results, governance violations, usage, environmentDigest, input/candidate/eval digests, limitations. Candidate cannot write held-out cases or switch to real accounts.',
 'AgentVersionManifest: versionId, prompt/config/model-policy/skills/tools/permission-policy/memory-policy/eval-set digests, compatibilityVersion, previousVersionRef?, signerRef. AgentVersionValidation: valid/rejected plus verifiedDigest and safe issues. A/B/canary/rollback is separately reviewed; signatures do not establish safety.',
 'AgentReleaseRequest: candidateManifestRef, immutableEvalReportRefs, protectedBaselineDigest, gateVersion, targetEnvironmentRef, promotionApprovalRef. AgentReleaseReport: eligible/denied, independent gate evidence, signatures, canary/rollback plan refs. Evaluation does not itself deploy or promote.',
 'ModelRoutingRequest: ModelRequest, taskClass, qualifiedCandidateModelRefs, scoringPolicyVersion, observedMetricRefs. ModelRoutingDecision: selectedModelRef|null, privacyEligibility evidence, scoreBasis, policyDecisionRef, budgetReservationRef, reason. Classify/authorize destination before cost/quality/latency scoring.',
 'SwarmRequest: goalRef, planRef, reviewedAllocationRef, agentVersionRefs, requestedDepth≤2, requestedFanOut≤8, sharedBudgetRef. SwarmPlan: chief/lead/worker assignments, dependency refs, reducedGrantRequests, task/deadline limits. Request limits may be lowered by policy; larger background allocations require a distinct reviewed schedule/scope and never unrestricted peer grants.',
];

const extensions = proposalRows.map((proposal,index) => {
  const [owner,paths,interfaces,deps,phase] = features[index];
  const originals = proposal.originalDependencies.filter(id => !(proposal.number==='31' && id==='28'));
  const requirements = [...new Set(originals.flatMap(id => system.tasks.find(task=>task.id===id)?.requirements ?? []))];
  const testPath = `tests/integration/v2-feature-${proposal.number}.test.ts`;
  return {id:`V2-T${proposal.number}`,title:proposal.title,kind:'extension',owner,requirements,proposalIds:[proposal.id],status:'pending',reviewStatus:'pending',phase,dependsOn:['M02','M03','M04',...(deps?deps.split(',').map(id=>`V2-T${id}`):[]),...(['01','02','03','04','25','27','34','35'].includes(proposal.number)?['M06','M09','M11']:[])],originalDependencies:originals,conditionalOriginalDependencies:proposal.number==='31'?[{id:'28',condition:'Enable a persistent research graph under the observation broker'}]:[],files:[...paths.split(';'),testPath],interfaces,contractShape:contractShapes[index],delta:proposal.meaning,acceptance:proposal.acceptance,checks:[`pnpm exec vitest run --project integration ${testPath}`,'pnpm typecheck','pnpm verify:architecture','pnpm verify:dependencies'],evidence:[]};
});

const migrationChecks = [
 ['pnpm exec vitest run --project unit tests/architecture/v2-traceability.test.ts','pnpm verify:traceability','pnpm verify:architecture'],
 ['pnpm exec vitest run --project unit packages/contracts/test/v2-contracts.test.ts packages/contracts/test/compatibility.test.ts','pnpm typecheck'],
 ['pnpm exec vitest run --project unit backend/modules/identity/test/grants.test.ts','pnpm exec vitest run --project security tests/security/credentials.test.ts','pnpm typecheck'],
 ['pnpm exec vitest run --project integration tests/integration/control-v2-qualification.test.ts','pnpm typecheck'],
 ['pnpm exec vitest run --project unit tests/ui/source-boundaries.test.ts','pnpm ui:verify:sources','pnpm ui:verify:boundaries','pnpm ui:typecheck'],
 ['pnpm exec vitest run --project unit tests/ui/contracts/v2-schemas.test.ts','pnpm ui:typecheck'],
 ['pnpm exec vitest run --project unit tests/ui/contracts/v2-mock-gateway.test.ts','pnpm ui:typecheck'],
 ['pnpm exec vitest run --project unit tests/ui/navigation.test.ts','pnpm exec playwright test tests/ui/e2e/navigation.spec.ts'],
 ['pnpm exec vitest run --project unit tests/ui/state/v2-reducer.test.ts tests/ui/state/reconnect.test.ts','pnpm ui:typecheck'],
 ['pnpm exec vitest run --project unit tests/ui/chat/v2-composer.test.ts','pnpm exec playwright test tests/ui/e2e/composer.spec.ts'],
 ['pnpm exec vitest run --project unit tests/ui/chat/messages.test.tsx','pnpm ui:typecheck','pnpm ui:build','pnpm exec playwright test tests/ui/e2e/v2-messages.spec.ts'],
];
migrations.forEach((task,index)=>{task.checks=migrationChecks[index];});
for(const task of [...migrations,...extensions]) {
  for(const command of task.checks) {
    for(const match of command.matchAll(/\b((?:tests|packages)\/[^ ]+\.(?:test|spec)\.tsx?)/g)) if(!task.files.includes(match[1]))task.files.push(match[1]);
  }
}
extensions.forEach(task=>{
  const specializedPath=`packages/contracts/src/v2/feature-${task.id.slice(-2)}.ts`;
  if(!task.files.some(path=>path.startsWith('packages/contracts/'))) task.files.push(specializedPath);
  task.files.push('packages/contracts/src/index.ts');
  const number=task.id.slice(-2);
  const coreCards={'01':'GoalCard','02':'PlanCard','04':'VerificationCard','25':'ProjectCard'};
  if(coreCards[number])task.files.push(`apps/web/src/features/chat/cards/${coreCards[number]}.tsx`);
  if(['01','02','04','25','27','34'].includes(number)&&!task.originalDependencies.includes('U10'))task.originalDependencies.push('U10');
  if(['11','13'].includes(number)&&!task.originalDependencies.includes('U09'))task.originalDependencies.push('U09');
  if(task.files.some(path=>path.startsWith('apps/web/'))) {
    const browserTest=`tests/ui/e2e/v2-feature-${number}.spec.ts`;
    task.files.push(browserTest);
    task.checks.push('pnpm ui:typecheck','pnpm ui:build',`pnpm exec playwright test ${browserTest}`);
  }
});
migrations.find(task=>task.id==='M03').files.push('tests/integration/identity-v2-restart.test.ts');
migrations.find(task=>task.id==='M03').checks.push('pnpm exec vitest run --project integration tests/integration/identity-v2-restart.test.ts');
const controlMigration=migrations.find(task=>task.id==='M04');
controlMigration.files=controlMigration.files.filter(path=>path!=='backend/database/migrations/postgres/001-control.sql');
controlMigration.readOnlySources=['backend/database/migrations/postgres/001-control.sql'];
controlMigration.files.push('scripts/apply-migrations.mjs','tests/integration/migration-registry.test.ts');
controlMigration.checks.push('pnpm exec vitest run --project integration tests/integration/migration-registry.test.ts');
migrations.find(task=>task.id==='M05').files.push('apps/web/src/lib/utils/cn.ts');
const releaseTask=extensions.find(task=>task.id==='V2-T38');
releaseTask.files.push('vitest.config.ts');
releaseTask.checks.push('pnpm exec vitest run --project release tests/release/v2-agent-pipeline.test.ts');
releaseTask.acceptance+=' Define the explicit Node release project and require the named release test to be discovered/executed; no jsdom or empty-suite pass substitutes for protected promotion, signed evidence and canary/rollback qualification.';
const migrationsByOriginal = Object.fromEntries(migrations.map(task=>[task.originalTask,task.id]));
const uiProposals = {
 U01:[],U02:proposalRows.map(p=>p.id),U03:proposalRows.map(p=>p.id),U04:['V2-F25'],U05:['V2-F01','V2-F02','V2-F04','V2-F25','V2-F34','V2-F35'],U06:['V2-F01','V2-F06','V2-F25'],U07:['V2-F04','V2-F27','V2-F31','V2-F34'],U08:['V2-F01','V2-F25'],U09:['V2-F11','V2-F13'],U10:['V2-F02','V2-F04','V2-F27','V2-F34'],U11:['V2-F39'],U12:['V2-F05','V2-F06','V2-F07','V2-F37'],U13:['V2-F09','V2-F12','V2-F24','V2-F28'],U14:['V2-F21','V2-F22','V2-F23'],U15:['V2-F01','V2-F08','V2-F16','V2-F19','V2-F25','V2-F35','V2-F40'],U16:['V2-F10','V2-F19'],U17:proposalRows.map(p=>p.id),U18:['V2-F05','V2-F10','V2-F21','V2-F39'],U19:['V2-F01','V2-F02','V2-F04','V2-F11','V2-F25','V2-F27'],U20:[],U21:[],U22:proposalRows.map(p=>p.id),
};
const integrationGate={id:'V2-G01',title:'Protected goal-to-artifact V2 workflow',kind:'integration_gate',owner:'supervisor',requirements:[...Array.from({length:24},(_,index)=>`R${String(index+1).padStart(2,'0')}`),...Array.from({length:18},(_,index)=>`F${String(index+1).padStart(2,'0')}`)],proposalIds:[],status:'pending',reviewStatus:'pending',dependsOn:['V2-T01','V2-T02','V2-T03','V2-T04','V2-T25','V2-T27','M11'],originalDependencies:[...Array.from({length:16},(_,index)=>String(index+1).padStart(2,'0')),'19','21','U10','U17','U18','U19'],files:['backend/workers/gateway/src/main.ts','backend/workers/orchestrator/src/main.ts','backend/modules/gateway/src/ui-v2.ts','backend/modules/orchestrator/src/v2-workflow.ts','tests/e2e/v2-goal-workflow.test.ts','tests/ui/e2e/v2-protected-workflow.spec.ts'],interfaces:'Wire the reviewed GoalSpec/TaskPlan/VerificationReport/ProjectRecord ports through existing authenticated GatewayClient and service composition roots; goal/result events use M06 negotiated projections',delta:'Prove a complete canonical live Chat→goal→bounded plan→specialist→authorized tool→real artifact→independent verification→delivery flow and recovery, rather than inferring it from isolated feature tests.',acceptance:'An approved workload with WorkspaceSession.demoMode=false produces an authorized artifact whose digest/provenance and current success criteria verify; a seeded unsupported claim remains unknown/unmet. Interrupt after effect before receipt, restart, reconcile without duplicate execution, cancel/revoke a child, and deny stale publication. All inference uses privacy, signed receipts verify, runtime-role scope isolation holds, and shared spend remains within the approved workload budget. Actual browser UI shows exact approvals, honest progress and verified versus unmet outcomes. Required unavailable infrastructure fails the live gate.',checks:['pnpm exec vitest run --project e2e tests/e2e/v2-goal-workflow.test.ts','pnpm exec playwright test tests/ui/e2e/v2-protected-workflow.spec.ts','pnpm ui:typecheck','pnpm ui:build','pnpm verify:architecture','pnpm verify:traceability','pnpm verify:protected-files'],evidence:[]};
const inherited = [...system.tasks.map(task => ({...task,proposalIds:proposalRows.filter(p=>p.originalDependencies.includes(task.id)).map(p=>p.id)})),...ui.tasks.map(task=>({...task,proposalIds:uiProposals[task.id]}))].map(task=>({id:task.id,title:task.title,status:task.status,requirements:task.requirements,dependsOn:[...(task.dependsOn ?? []),...(task.backendDependsOn ?? [])],migrationTask:migrationsByOriginal[task.id]??null,proposalIds:task.proposalIds,evidenceCount:(task.evidence??[]).length,evidenceSha256:hash(JSON.stringify(task.evidence ?? []))}));

const ledger = existsSync(resolve(root,ledgerPath)) ? json(ledgerPath) : {schemaVersion:1,productTarget:'V2',status:'proposed',approvedByHuman:false,date:'2026-10-07',timezone:'Asia/Calcutta',guide:guidePath,executionMethod:'native-sequential',approval:{scope:'V2 consolidation and migration preparation authorized; exact new contracts/plan await review',reviewStatus:'pending',decisions:[],pendingDecisions:['V2 guide/contracts/task scope review','firstRealTasks','modelDataPolicy','spendRetentionQuotas','microVmBackend']},inheritedSnapshot:inherited,tasks:[...migrations,...extensions,integrationGate],documentationEvidence:[]};
// Refresh pending plan definitions while preserving progress and original evidence.
const drafted=[...migrations,...extensions,integrationGate];
ledger.tasks=drafted.map(task=>{
  const existing=ledger.tasks.find(previous=>previous.id===task.id);
  if(existing?.reviewStatus==='approved') return existing;
  return {...task,status:existing?.status??task.status,reviewStatus:existing?.reviewStatus??task.reviewStatus,evidence:existing?.evidence??[],...(existing?.knownGaps?{knownGaps:existing.knownGaps}:{})};
});
ledger.inheritedSnapshot=ledger.inheritedSnapshot.map(saved=>({...saved,evidenceCount:saved.evidenceCount??inherited.find(task=>task.id===saved.id).evidenceCount}));
ledger.inheritedExecutionGates=Object.fromEntries(inherited.filter(task=>task.status!=='completed').map(task=>[task.id,[...new Set(task.dependsOn.map(id=>migrationsByOriginal[id]).filter(Boolean))]]));
ledger.catalogPortGates={models:['06','07','11'],skills:['07','13','18'],connections:['07','13','20','22','23'],memory:['07','09'],activity:['04','05','10'],settings:['06','07','21','25']};
ledger.activatedConditionalDependencies ??= {};
ledger.migrationRegistry={reviewStatus:'pending',ordering:'Explicit dependency DAG plus immutable applied migration IDs/checksums; numeric prefixes are unique IDs, not permission to apply an incomplete task. Never auto-run pending original schema files.',reservedInherited:['001-control.sql','002-audit.sql','003-budgets.sql','004-memory-rls.sql','005-skills.sql','006-schedules.sql','007-learning.sql','008-observations.sql'],newMigrations:[{file:'009-identity-grants.sql',owner:'M03',requires:['001-control.sql']},{file:'010-control-qualification.sql',owner:'M04',requires:['001-control.sql','009-identity-grants.sql']},{file:'011-v2-goals.sql',owner:'V2-T01',requires:['010-control-qualification.sql']},{file:'012-v2-memory-lifecycle.sql',owner:'V2-T21',requires:['004-memory-rls.sql']},{file:'013-v2-projects.sql',owner:'V2-T25',requires:['006-schedules.sql','011-v2-goals.sql']}]};
write(ledgerPath,JSON.stringify(ledger,null,2)+'\n');

// Navigation changes do not change historical statuses, approvals or evidence.
if (process.argv.includes('--link')) {
  const note='> **V2 consolidation (2026-10-07):** Read [the unified V2 build guide](LINK) for the combined target, completed-task migrations and extension task cards. This file remains a source record; its historical status prose is not current completion evidence. New V2 boundaries await recorded review.\n\n';
  for (const path of fileList.filter(path=>path.startsWith('docs/') && !path.startsWith('docs/decisions/') && !path.startsWith('docs/runbooks/'))) {
    const original=read(path);
    if(!original.includes('**V2 consolidation (2026-10-07):**')) {
      const relative=path.startsWith('docs/superpowers/')?'../../v2-build-guide.md':'v2-build-guide.md';
      write(path,note.replace('LINK',relative)+original);
    }
  }
  for(const [path,source] of [['docs/task-ledger.json',system],['docs/ui-task-ledger.json',ui]]) {
    const previous=JSON.stringify(source.tasks.map(task=>({id:task.id,status:task.status,evidence:task.evidence})));
    source.v2Planning={target:'V2',guide:guidePath,ledger:ledgerPath,reviewStatus:'pending',historicalCompletionPreserved:true};
    for(const task of source.tasks) {
      const snapshot=inherited.find(item=>item.id===task.id);
      task.v2ProposalIds=snapshot.proposalIds;
      if(snapshot.migrationTask) task.v2MigrationTaskId=snapshot.migrationTask;
    }
    if(previous!==JSON.stringify(source.tasks.map(task=>({id:task.id,status:task.status,evidence:task.evidence})))) throw new Error('Historical evidence mutation');
    write(path,JSON.stringify(source,null,2)+'\n');
  }
  // Archive the now-current source documents, including their navigation notices.
  for(const source of sourceSnapshots) source.text=read(source.path);
}

let output = core;
if(ledger.documentationEvidence.length) {
  output+='\n### Recorded documentation validation\n\n| Command | Result | Scope / limitation |\n|---|---|---|\n';
  for(const evidence of ledger.documentationEvidence)output+=`| ${evidence.command} | ${evidence.result} | ${evidence.limitations} |\n`;
  output+='\nThese are fresh documentation/governance observations for 2026-10-07; no product migration or V2 feature is marked completed by them.\n';
}
output += '\n## Generated migration cards\n\n';
for (const task of ledger.tasks) {
  if (task.kind==='extension' && task.id==='V2-T01') output += '\n## Generated V2 extension cards\n\n';
  if(task.kind==='integration_gate')output+='\n## Generated protected V2 acceptance gate\n\n';
  output += `### ${task.id}: ${task.title}\n\n`;
  output += `**State:** ${task.status}; exact boundary review ${task.reviewStatus}. **Owner:** ${task.owner}.\n\n`;
  output += `**Requirements:** ${task.requirements.join(', ') || 'Inherited global invariants'}${task.proposalIds.length?'; '+task.proposalIds.join(', '):''}.\n\n`;
  output += `**Dependencies:** ${task.dependsOn.join(', ') || 'Human review of this guide'}; original ${task.originalDependencies.join(', ')} (fresh qualified evidence, not merely a status label).${task.conditionalOriginalDependencies?.length ? ' Conditional: '+task.conditionalOriginalDependencies.map(dep=>`${dep.id} when ${dep.condition}`).join('; ')+'.':''}\n\n`;
  output += '**Files (one designated owner; exact new paths are proposed):**\n\n'+task.files.map(path=>`- \`${path}\``).join('\n')+'\n\n';
  if(task.readOnlySources)output+='**Read-only source references (do not edit an applied file):** '+task.readOnlySources.map(path=>`\`${path}\``).join(', ')+'.\n\n';
  output += `**Interfaces:** ${task.interfaces}. Consumes reviewed core contracts and the original anchor-task ports; exports inferred schema types for any specialized contract named here. Schemas for specialized types belong beside the listed feature contracts; no generic unvalidated payload. Sequential task owner also owns its explicit public export additions; review changes to shared index.ts before consumers.\n\n`;
  if(task.contractShape) output += `**Specialized contract shape for review:** ${task.contractShape}\n\n`;
  output += `**Change:** ${task.delta}\n\n**Acceptance:** ${task.acceptance}\n\n`;
  if(task.knownGaps)output+='**Recorded qualification gaps (not completed repairs):**\n\n'+task.knownGaps.map(gap=>`- ${gap}`).join('\n')+'\n\n';
  output += '- [ ] Confirm exact boundary/scope review, dependency evidence, fixture-vs-live tier and isolated service qualification; inspect actual file paths before editing and record any proposed-path correction.\n';
  output += '- [ ] Create the named behavior regression(s) asserting every acceptance sentence, plus stale/revoked/tenant/budget/cancellation cases relevant to this boundary. Test the observed old defect separately from the new capability.\n';
  output += '- [ ] Run the targeted test and record meaningful RED; a missing test file or infrastructure alone is not the behavior reproduction.\n';
  output += '- [ ] Implement only owned files and reviewed port/schema changes; use existing privacy/tool/memory/control routes.\n';
  output += '- [ ] Run the following task checks (new named test files are created in this task), plus affected full regressions and required security/live checks. Require all named acceptance tests executed, no required skips, exit 0.\n\n';
  output += task.checks.map(command=>`  - \`${command}\``).join('\n')+'\n\n';
  if (task.id==='M03') output += '  - `pnpm exec vitest run --project security tests/security/credentials.test.ts` and native Windows identity process/credential checks; sandbox isolation remains unavailable until Task12 qualifies a Windows backend.\n\n';
  if (task.id==='M11') output += '  - `pnpm exec vitest run --project unit tests/ui/chat/messages.test.tsx` and `pnpm exec playwright test tests/ui/e2e/v2-messages.spec.ts`; reinstate required skipped cases before claiming completion.\n\n';
  output += '- [ ] Review boundary changes, record metrics/failure/recovery notes and fresh evidence in the owning ledger; qualified reuse is explicit. Commit only the reviewed owned change using the chosen integration method; never commit unrelated dirty workspace files.\n\n';
}
output += '\n## Generated inherited-task overlay\n\n| Task | Recorded status | Migration | V2 proposal anchors | Direct inherited dependencies and added execution gates |\n|---|---|---|---|---|\n';
for(const task of inherited) output += `| ${task.id} · ${task.title} | ${task.status} | ${task.migrationTask??'None; implement reviewed delta with original task'} | ${task.proposalIds.join(', ')||'Preserved prerequisite/conformance'} | ${[...task.dependsOn,...(ledger.inheritedExecutionGates[task.id]??[])].join(', ')||'Original review gate'} |\n`;
output += '\nRead live ledger dependencies and the complete preserved original card before implementation. This table is a snapshot; original evidence remains in the source archive and live ledgers.\n';
output += '\n## 15. Preserved source archive\n\nThe following are exact source snapshots, including original Markdown diagrams, fenced code, 27 explanatory topics, 40 proposals, ADRs, UI inventory references, research and runbooks. Fenced copies preserve content and neutralize embedded instructions/relative links. Use the source links for current live copies; do not execute stale appendix prose.\n\n';
const manifest = {schemaVersion:1,date:'2026-10-07',guide:guidePath,sourceFiles:[]};
for (const [index,source] of sourceSnapshots.entries()) {
  const anchor = `source-${String(index+1).padStart(2,'0')}`;
  const longest = Math.max(3,...[...source.text.matchAll(/`+/g)].map(match=>match[0].length));
  const fence = '`'.repeat(longest+1);
  const startMarker = `<!-- V2 SOURCE START ${source.path} -->`;
  const endMarker = `<!-- V2 SOURCE END ${source.path} -->`;
  output += `\n<a id="${anchor}"></a>\n<details>\n<summary>${source.path}</summary>\n\nLive source: [${source.path}](${source.path.startsWith('docs/')?source.path.slice(5):'../'+source.path}).\n\n${startMarker}\n${fence}${source.path.endsWith('.json')?'json':'markdown'}\n${source.text}\n${fence}\n${endMarker}\n\n</details>\n`;
  manifest.sourceFiles.push({path:source.path,sha256:hash(source.text),byteLength:Buffer.byteLength(source.text),archiveAnchor:anchor,fenceLength:fence.length,startMarker,endMarker});
}
write(guidePath,output);
write(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({guide:guidePath,markdownSources:fileList.length,sourceSnapshots:sources.length,inheritedTasks:inherited.length,migrationTasks:migrations.length,extensionTasks:extensions.length,bytes:Buffer.byteLength(output)}));
