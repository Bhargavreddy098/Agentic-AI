# Backend API contracts

Status: target API specification; routes are not implemented by writing this document. Public base `/api/v1`. Existing `/api/ui/v1` routes are legacy migration inputs, not automatic aliases. Produce a machine-readable OpenAPI contract from these definitions during implementation; no JSON specification file is created in this reset.

## Transport and common behavior

REST resources and commands use JSON over local loopback HTTP or authenticated TLS remotely. SSE streams durable progress. Internal broker/worker traffic uses authenticated versioned messages; it is never exposed by a wildcard public proxy. Browser WebSockets are deferred.

All objects are strict: reject unknown fields; IDs are UUIDs, digests lowercase 64-character SHA-256 strings, timestamps RFC3339 UTC. `?` means optional, `[]` bounded array, `|` enum alternatives. References are checked within the authenticated workspace/project. Clients cannot set `workspaceId`, `principalId`, `cost`, `approvedBy`, or verified/completed state in arbitrary DTOs.

Success is `{data:T,meta:{requestId,version?}}`; lists are `{data:T[],meta:{requestId,nextCursor:null|string}}`. Async acceptance returns HTTP 202 with `Operation` and `Location`; creation returns 201 unless explicitly 202. GET/PATCH/command results return 200; DELETE session returns 204. An operation is `{id,kind,state:queued|running|blocked|succeeded|failed|cancelled,resourceType?,resourceId?,safeError?,createdAt,updatedAt}`. Its success means the operation finished, not that a goal is verified.

Errors use `application/problem+json`: `{type,title,status,code,detail,requestId,retryable,errors?:[{path,message}]}`. Redact internal SQL, paths, credentials, and provider raw errors. Common statuses: 400 `INVALID_INPUT`; 401 `UNAUTHENTICATED`; 403 `POLICY_DENIED`/`CSRF_FAILED`; 404 `NOT_FOUND` (including inaccessible IDs); 409 `STATE_CONFLICT`/`IDEMPOTENCY_CONFLICT`; 412 `VERSION_MISMATCH`; 413 `PAYLOAD_TOO_LARGE`; 422 `DOMAIN_INVALID`; 428 `PRECONDITION_REQUIRED`; 429 `RATE_LIMITED`; 503 `CAPABILITY_UNAVAILABLE`. Routes below list additional business errors. No permission to act is inferred from a 200 catalog/health response.

### Authentication / write profiles used in every route row

| Profile | Authentication and authorization | Write / retry rules |
| --- | --- | --- |
| Public | No session; loopback/Host restrictions and rate limits | Read-only except explicit bootstrap challenge |
| Owner-R | Valid opaque local session; resource scope; exact Origin if supplied | Safe GET; no effect; optional conditional ETag |
| Owner-W | Owner-R plus CSRF token and exact allowed Origin for browser requests | `Idempotency-Key` required; durable response replay; PATCH also `If-Match` |
| Owner-H | Owner-W plus fresh human-presence proof where configured; approval of exact revision/target | Same idempotency rules; never accepts agent identity as human approver |
| Webhook | Provider signature over raw bytes, timestamp/replay window, configured trigger identity | Dedup source/delivery ID; no browser CSRF requirement |
| Worker | Authenticated broker connection, audience, scope, run/task epoch, expiry | Stable message/effect IDs; duplicate receipt yields same result |

All mutation keys are scoped to principal + workspace + normalized route + key; store canonical request digest and response atomically. Same key/different body returns 409. Same key/in-flight returns 202 for its operation, never launches a second one. Retain HTTP replay records at least seven days; permanent effects/occurrences keep unique logical identities beyond that window. For uploads, content PUT is idempotent by upload ID and expected digest. DELETE archive requests are idempotent commands, not destructive implicit cascades.

List query `Page = {limit?:1..100(default50),cursor?:opaque}` with deterministic keyset ordering, plus only listed filters. Never accept raw SQL sort expressions. Mutation ETags encode aggregate version. Commands against immutable revisions use `digest` and state preconditions instead of mutating revision ETags.

## Session, workspace, project and settings routes

| Method and route | Purpose / request shape | Response data | Profile | Additional errors |
| --- | --- | --- | --- | --- |
| GET `/health/live` (outside base) | Process liveness; no body | `{status:"live"}` | Public | 503 |
| GET `/health/ready` (outside base) | Required dependencies ready | `{ready:boolean}` with no secret details | Public | 503 `DEPENDENCY_UNREADY` |
| POST `/session/bootstrap` | `{challenge:string,clientNonce:string}`; challenge issued by trusted launcher over OS-protected channel | `Session`; sets HttpOnly SameSite cookie | Public, single-use challenge | `CHALLENGE_EXPIRED`, `ALREADY_USED`; reject remote/cross-origin |
| GET `/session` | Current principal/session | `Session` | Owner-R | `SESSION_EXPIRED` |
| DELETE `/session` | Revoke current session; CSRF required | no body, 204 | Owner-W | none; repeated revoke is 204 |
| GET `/workspaces` | `Page` | `Workspace[]` | Owner-R | none |
| GET `/capabilities` | Available/disabled product operations | `{items:[{name,state,reason?,qualificationRef?}]}` | Owner-R | none |
| POST `/projects` | `{name,kind:greenfield\|existing,workspaceRootRef?,repositoryConnectionId?}` | `Project` | Owner-W | `ROOT_NOT_AUTHORIZED` |
| GET `/projects` | `Page & {status?}` | `Project[]` | Owner-R | none |
| GET `/projects/:projectId` | Scoped project view | `Project` | Owner-R | none |
| PATCH `/projects/:projectId` | `{name?,description?}` | `Project` | Owner-W | `PROJECT_ARCHIVED` |
| POST `/projects/:projectId/archive` | `{reason}` | `Project` | Owner-W | `ACTIVE_RUNS_EXIST` |
| POST `/projects/:projectId/snapshots` | `{includeUncommitted:boolean}` | `Operation` → `RepositorySnapshot` | Owner-W | `ROOT_NOT_AUTHORIZED`, `REPOSITORY_CHANGED` |
| GET `/operations/:operationId` | Poll async command | `Operation` | Owner-R | none |
| GET `/settings` | Non-secret preferences and limits | `{version,privacy,retention,defaultAutonomy,limits}` | Owner-R | none |
| PATCH `/settings` | `{privacy?,retention?,defaultAutonomy?,limits?}`; typed policy DTOs | same settings | Owner-H | `ACTIVE_POLICY_CONFLICT` |

`Session={principalId,workspaceId,expiresAt,csrfToken}`; never returns cookie token. `Workspace={id,name,ownerPrincipalId,status}`. `Project={id,name,description?,kind,status,workspaceRootRef?,repositoryConnectionId?,version,createdAt,updatedAt}`. `RepositorySnapshot={id,projectId,commitSha?,treeDigest,artifactId,indexStatus,createdAt}`. A workspace root is registered by the native local bootstrap/broker picker; public clients cannot authorize host paths by typing them into JSON.

## Conversations, goals, research and requirements

| Method and route | Purpose / request shape | Response data | Profile | Additional errors |
| --- | --- | --- | --- | --- |
| POST `/projects/:projectId/conversations` | `{title?}` | `Conversation` | Owner-W | `PROJECT_ARCHIVED` |
| GET `/projects/:projectId/conversations` | `Page` | `Conversation[]` | Owner-R | none |
| GET `/conversations/:conversationId` | Conversation metadata | `Conversation` | Owner-R | none |
| POST `/conversations/:conversationId/messages` | `{text:string(1..32000),attachmentIds?:UUID[0..10]}` | `Message` | Owner-W | `ATTACHMENT_UNAVAILABLE` |
| GET `/conversations/:conversationId/messages` | `Page` | `Message[]` | Owner-R | none |
| POST `/conversations/:conversationId/goals` | `{messageId,constraints?:Constraint[],autonomyMode}` | `Goal` | Owner-W | `MESSAGE_SCOPE_MISMATCH` |
| GET `/projects/:projectId/goals` | `Page & {status?}` | `Goal[]` | Owner-R | none |
| GET `/goals/:goalId` | Goal and progress references | `Goal` | Owner-R | none |
| POST `/goals/:goalId/intent-analysis` | `{inputMessageIds:UUID[],budgetCeilingMicroUsd:string}` | `Operation` → `IntentAnalysis` | Owner-W | `BUDGET_REQUIRED`, `PROVIDER_UNAVAILABLE` |
| GET `/goals/:goalId/clarifications` | `Page & {status?}` | `Clarification[]` | Owner-R | none |
| POST `/clarifications/:clarificationId/answers` | `{answer:string,selectedOptionId?}` | `Clarification` | Owner-W | `ALREADY_RESOLVED`, `CONTRACT_REAPPROVAL_REQUIRED` |
| POST `/goals/:goalId/research` | `{questions:string[1..20],allowedSources?:string[],budgetCeilingMicroUsd:string}` | `Operation` → `ResearchReport` | Owner-W | `NETWORK_NOT_ALLOWED`, `BUDGET_EXCEEDED` |
| GET `/goals/:goalId/research` | `Page` | `ResearchReport[]` | Owner-R | none |
| POST `/goals/:goalId/requirement-revisions` | `{requirements:RequirementInput[],assumptions:Assumption[],exclusions:string[],sourceRefs:UUID[]}` | `RequirementRevision` | Owner-W | `MISSING_REQUIRED_CRITERIA`, `UNRESOLVED_MATERIAL_QUESTION` |
| GET `/goals/:goalId/requirement-revisions` | `Page` | `RequirementRevision[]` | Owner-R | none |
| GET `/requirement-revisions/:revisionId` | Exact immutable revision | `RequirementRevision` | Owner-R | none |
| GET `/goals/:goalId/decisions` | `Page` | `Decision[]` | Owner-R | none |
| POST `/goals/:goalId/decisions` | `{proposal,alternatives:string[],status,rationale,sourceRefs:UUID[]}` | `Decision` | Owner-W | `APPROVAL_REQUIRED` for material binding changes |

`Conversation={id,projectId,title,status,version}`. `Message={id,conversationId,sequence,role,text,attachmentIds,createdAt,trustLabel}`; text may be redacted according to classification. `Constraint={key,value,sourceMessageId}`. `Goal={id,projectId,conversationId,intent,constraints,status,activeRequirementRevisionId?,activeContractRevisionId?,version}`. `IntentAnalysis={goalId,literalRequest,desiredOutcome,constraints,assumptions,unknowns,acceptanceCandidates,sourceRefs}`. `Clarification={id,goalId,question,materiality,options:[{id,label}],answer?,status,version}`.

`Assumption={key,statement,risk:low|medium|high,sourceRef?,needsDecision:boolean}`. `RequirementInput={key,kind:functional|nonfunctional,priority:must|should|could,statement,sourceRefs,criteria:[{key,required:boolean,method,expected,environment}]}`. `RequirementRevision={id,goalId,revision,digest,requirements:RequirementInput[],assumptions,exclusions,sourceRefs,createdAt}`. `ResearchReport={id,goalId,questions,conclusions:[{claim,sourceRefs,confidence,freshUntil?}],sourceRefs,artifactId,createdAt}`. `Decision={id,goalId,status:accepted|challenged|rejected|alternative|requires_user_decision,proposal,alternatives,rationale,sourceRefs,createdAt}`.

## Plans, contracts, approvals and policies

| Method and route | Purpose / request shape | Response data | Profile | Additional errors |
| --- | --- | --- | --- | --- |
| POST `/goals/:goalId/plans` | `{requirementRevisionId,budgetCeilingMicroUsd}` | `Operation` → `PlanRevision` | Owner-W | `REQUIREMENTS_INCOMPLETE`, `BUDGET_EXCEEDED` |
| GET `/goals/:goalId/plans` | `Page` | `PlanRevision[]` | Owner-R | none |
| POST `/plans/:planId/revisions` | `{baseRevisionId,layers,steps:PlanStep[],reason}` | `PlanRevision` | Owner-W | `DAG_CYCLE`, `UNSCOPED_STEP`, `BASE_CHANGED` |
| GET `/plan-revisions/:revisionId` | Exact plan revision | `PlanRevision` | Owner-R | none |
| POST `/goals/:goalId/contracts` | `{planRevisionId,document:BuildContractInput}` | `ContractRevision` | Owner-W | `CONTRACT_INCOMPLETE`, `UNRESOLVED_MATERIAL_QUESTION` |
| POST `/contracts/:contractId/revisions` | `{baseRevisionId,planRevisionId,document:BuildContractInput,reason}` | `ContractRevision` | Owner-W | `BASE_CHANGED`, `CONTRACT_INCOMPLETE` |
| GET `/contracts/:contractId/revisions` | `Page` | `ContractRevision[]` | Owner-R | none |
| GET `/contract-revisions/:revisionId` | Exact approvable document | `ContractRevision` | Owner-R | none |
| GET `/contract-revisions/:revisionId/diff` | Query `{against:revisionId}` | `{fromDigest,toDigest,changes:[{path,before,after,material:boolean}],requiresApproval}` | Owner-R | `DIFFERENT_CONTRACT` |
| POST `/contract-revisions/:revisionId/approval-requests` | `{digest}` | `Approval` | Owner-W | `CONTRACT_INCOMPLETE`, `DIGEST_MISMATCH` |
| GET `/approvals` | `Page & {projectId?,state?}` | `Approval[]` | Owner-R | none |
| GET `/approvals/:approvalId` | Approval, scope, diff, cost and consequences | `Approval` | Owner-R | none |
| POST `/approvals/:approvalId/decisions` | `{decision:approve\|reject,nonce,digest,reason?}` | `Approval` | Owner-H | `APPROVAL_EXPIRED`, `DIGEST_MISMATCH`, `ALREADY_DECIDED` |
| POST `/approvals/:approvalId/revoke` | `{reason}` | `Approval` | Owner-H | `EFFECT_ALREADY_DISPATCHED` |
| GET `/policies/current` | Active non-secret rules | `PolicyRevision` | Owner-R | none |
| POST `/policies/revisions` | `{baseRevisionId,rules:PolicyRules,reason}` | `PolicyRevision` | Owner-H | `RULE_CONFLICT`, `UNSAFE_POLICY` |
| POST `/policies/:revisionId/activate` | `{digest}` | `PolicyRevision` | Owner-H | `DIGEST_MISMATCH`, `POLICY_QUALIFICATION_REQUIRED` |
| GET `/projects/:projectId/grants` | `Page` | `CapabilityGrant[]` | Owner-R | none |
| POST `/projects/:projectId/grants` | `{capability,resourceScope,expiresAt,contractRevisionId?}` | `CapabilityGrant` | Owner-H | `SCOPE_NOT_ALLOWED` |
| POST `/grants/:grantId/revoke` | `{reason}` | `CapabilityGrant` | Owner-H | none; revoke idempotent |

`PlanStep={key,objective,dependsOn:string[],deliverableSchema,capabilities:string[],budgetCeilingMicroUsd,criterionRefs:UUID[]}`. `PlanRevision={id,planId,goalId,revision,requirementRevisionId,digest,layers,steps,createdAt}`. `layers` follows the twenty layer schemas in [planning](06-INTELLIGENCE-AND-CONTRACTS.md), not arbitrary unvalidated JSON.

`ContractRevision={id,contractId,goalId,revision,planRevisionId,requirementRevisionId,digest,schemaVersion,canonicalizerVersion,document:BuildContractInput,supersedesId?,createdAt}`. `BuildContractInput` is the complete schema in that same document. Server computes digests and revision numbers.

`Approval={id,kind:contract|effect,contractRevisionId,effectId?,digest,policyRevisionId,state,expiresAt,nonce?,scopeSummary,costCeilingMicroUsd,diffRef?,consequences,decidedAt?}`; expose nonce only to designated owner while pending. `PolicyRules={autonomyModes,capabilityRules,highImpactActions,budgetRules,privacyRules}` with versioned enumerated schemas, no arbitrary JavaScript. `PolicyRevision={id,revision,digest,rules,active,createdAt}`. `CapabilityGrant={id,projectId,capability,resourceScope,expiresAt,revokedAt?,contractRevisionId?}`.

## Runs, agents, tools and artifacts

| Method and route | Purpose / request shape | Response data | Profile | Additional errors |
| --- | --- | --- | --- | --- |
| POST `/goals/:goalId/runs` | `{contractRevisionId,contractDigest,repositorySnapshotId,budgetCeilingMicroUsd}` | `Run`, HTTP 202 | Owner-W | `APPROVAL_REQUIRED`, `SANDBOX_UNAVAILABLE`, `BUDGET_EXCEEDED` |
| GET `/projects/:projectId/runs` | `Page & {state?}` | `Run[]` | Owner-R | none |
| GET `/runs/:runId` | Durable run projection | `Run` | Owner-R | none |
| POST `/runs/:runId/pause` | `{reason}` | `Run`, 202 until safe pause | Owner-W | `TERMINAL_RUN` |
| POST `/runs/:runId/resume` | `{checkpointId,expectedEpoch:string}` | `Run`, 202 | Owner-W | `STALE_CHECKPOINT`, `APPROVAL_REQUIRED`, `EFFECT_UNCERTAIN` |
| POST `/runs/:runId/cancel` | `{reason}` | `Run`, 202 until reconciled | Owner-W | `TERMINAL_RUN`; repeat returns current state |
| GET `/runs/:runId/tasks` | `Page & {state?}` | `Task[]` | Owner-R | none |
| GET `/runs/:runId/agents` | `Page` | `AgentSession[]` | Owner-R | none |
| GET `/runs/:runId/effects` | `Page & {state?}` | `Effect[]` | Owner-R | none |
| POST `/effects/:effectId/reconcile` | `{externalReceiptRef?,reason}`; requests trusted reconciliation, does not assert success | `Operation` → `Effect` | Owner-H | `RECEIPT_INVALID`, `OUTCOME_UNKNOWN` |
| GET `/runs/:runId/checkpoints` | `Page` | `Checkpoint[]` | Owner-R | none |
| GET `/runs/:runId/events` | SSE; `Last-Event-ID` or `after?` | `RunEvent` stream | Owner-R | 410 `EVENT_CURSOR_EXPIRED` |
| GET `/tools` | `Page & {capability?,availability?}` | `ToolDefinition[]` | Owner-R | none |
| GET `/tools/:toolId` | Qualified manifest projection | `ToolDefinition` | Owner-R | none |
| POST `/projects/:projectId/uploads` | `{filename,mediaType,bytes:string,digest}` | `Upload` | Owner-W | `QUOTA_EXCEEDED`, `MEDIA_TYPE_DENIED` |
| PUT `/uploads/:uploadId/content` | Bounded binary stream; expected length/digest | `Upload` | Owner-W, upload-ID idempotency | `HASH_MISMATCH`, `UPLOAD_EXPIRED` |
| POST `/uploads/:uploadId/complete` | `{digest}` | `Operation` → `Artifact` | Owner-W | `INCOMPLETE_UPLOAD`, `QUARANTINED` |
| GET `/projects/:projectId/artifacts` | `Page & {runId?,kind?}` | `Artifact[]` | Owner-R | none |
| GET `/artifacts/:artifactId` | Metadata and evidence links | `Artifact` | Owner-R | `QUARANTINED` |
| GET `/artifacts/:artifactId/content` | Authorized byte stream; Range only if supported | bytes with digest, safe Content-Disposition | Owner-R | `ARTIFACT_UNAVAILABLE`, 416 invalid range |
| POST `/artifacts/:artifactId/export` | `{destinationRef}` authorized local destination | `Operation` | Owner-W | `DESTINATION_NOT_ALLOWED`, `OVERWRITE_APPROVAL_REQUIRED` |

`Run={id,goalId,contractRevisionId,planRevisionId,repositorySnapshotId,state,autonomyMode,epoch,progress:{completedTasks,totalTasks},budget:{limit,reserved,spent},verificationReportId?,blockers:[],version}`. `Task={id,runId,stepKey,state,attempt,maxAttempts,deadlineAt,leaseEpoch,dependencies,artifactIds}`. `AgentSession={id,runId,taskId,role,state,capabilities,deadlineAt,usageSummary}`. `Effect={id,runId,taskId,toolId,inputDigest,targetSummary,risk,state,approvalId?,receiptRef?,externalOperationId?}`. `Checkpoint={id,runId,sequence,epoch,stateDigest,createdAt}`. `ToolDefinition={id,name,revision,inputSchema,outputSchema,capabilities,risk,timeoutMs,idempotency,cancellation,availability}`. `Upload={id,state,expectedBytes,receivedBytes,expectedDigest,expiresAt}`. `Artifact={id,projectId,runId?,digest,bytes,mediaType,status,classification,createdAt,provenanceRefs}`.

There is deliberately no public `POST /shell`, arbitrary SQL endpoint, or client route to create privileged agents. Agent creation and tool dispatch are internal consequences of approved tasks.

## Providers, developer connections, memory and knowledge

| Method and route | Purpose / request shape | Response data | Profile | Additional errors |
| --- | --- | --- | --- | --- |
| POST `/providers` | `{kind,displayName,endpointPolicy,secretReferenceId?,privacyPolicy}` | `Provider` | Owner-H | `ENDPOINT_NOT_ALLOWED`, `AUTH_METHOD_UNSUPPORTED` |
| GET `/providers` | `Page` | `Provider[]` | Owner-R | none |
| GET `/providers/:providerId` | Safe configuration/health | `Provider` | Owner-R | none |
| PATCH `/providers/:providerId` | `{displayName?,secretReferenceId?,privacyPolicy?,enabled?}` | `Provider` | Owner-H | `ACTIVE_CALLS_EXIST` |
| POST `/providers/:providerId/discovery` | `{probe:boolean,budgetCeilingMicroUsd?}` | `Operation` → `Model[]` | Owner-W | `CREDENTIAL_UNAVAILABLE`, `BUDGET_REQUIRED` for paid probe |
| GET `/models` | `Page & {providerId?,capability?}` | `Model[]` | Owner-R | none |
| POST `/routing/preview` | `{taskType,capabilities,estimatedInputTokens,maxOutputTokens,classification,budgetCeilingMicroUsd}` | `RoutingDecision` | Owner-W | `NO_ELIGIBLE_MODEL`; no model invocation |
| POST `/developer-connections` | `{adapterKind,installRef,authMethod,requestedCapabilities}` | `DeveloperConnection` | Owner-H | `ADAPTER_UNSUPPORTED` |
| GET `/developer-connections` | `Page` | `DeveloperConnection[]` | Owner-R | none |
| POST `/developer-connections/:connectionId/qualify` | `{testProfile,budgetCeilingMicroUsd}` | `Operation` | Owner-H | `SANDBOX_UNAVAILABLE`, `AUTH_REQUIRED` |
| POST `/developer-connections/:connectionId/disconnect` | `{reason}` | `DeveloperConnection` | Owner-H | none; revokes new dispatch |
| POST `/projects/:projectId/memories` | `{scopeKind,memoryKind,text,sourceRefs,confidence,expiresAt?}` | `Memory` | Owner-W | `SCOPE_DENIED`, `SECRET_DETECTED` |
| GET `/projects/:projectId/memories` | `Page & {memoryKind?,scopeKind?}` | `Memory[]` | Owner-R | none |
| GET `/memories/:memoryId` | Current revision with provenance | `Memory` | Owner-R | `MEMORY_EXPIRED` |
| POST `/memories/:memoryId/revisions` | `{baseRevision,text,sourceRefs,confidence,reason,expiresAt?}` | `Memory` | Owner-W | `BASE_CHANGED`, `SECRET_DETECTED` |
| DELETE `/memories/:memoryId` | `{reason}`; tombstone and purge job | `Operation` | Owner-W | none; repeat resolves to same deletion |
| POST `/projects/:projectId/memory-search` | `{query,scopeKinds,memoryKinds?,limit?:1..50,budgetCeilingMicroUsd?}` | `{items:[{memory:Memory,score,sourceRefs}],embeddingSpaceId?,partial:boolean}` | Owner-W | `SCOPE_DENIED`, `BUDGET_REQUIRED` for external embedding |
| POST `/projects/:projectId/knowledge-index` | `{snapshotId}` | `Operation` | Owner-W | `SNAPSHOT_UNAVAILABLE` |
| GET `/projects/:projectId/knowledge/nodes` | `Page & {snapshotId,kind?,path?}` | `KnowledgeNode[]` | Owner-R | none |
| GET `/projects/:projectId/knowledge/edges` | `Page & {snapshotId,nodeId,kind?,direction?:in\|out}` | `KnowledgeEdge[]` | Owner-R | none |

`Provider={id,kind,displayName,status,endpointSummary,authMethod,credentialConfigured:boolean,privacyPolicy,health,version}`. `Model={id,providerId,externalModelId,revision,capabilities,contextLimit,pricingRevision,availability,qualificationRef?}`. `RoutingDecision={eligible:[{modelId,score,reasons}],rejected:[{modelId,reasons}],selectedModelId?,estimatedCeilingMicroUsd,policyRevisionId}`. `DeveloperConnection={id,adapterKind,authMethod,capabilities,status,qualificationRef?,version}`. `Memory={id,projectId,scopeKind,memoryKind,revision,text,confidence,sourceRefs,expiresAt?,classification}`. `KnowledgeNode={id,snapshotId,kind,stableKey,path?,range?,contentDigest,sourceRefs}`. `KnowledgeEdge={id,snapshotId,fromNodeId,toNodeId,kind,confidence,sourceRefs}`.

Secret entry/rotation uses a trusted native secret-store interface, returning only `secretReferenceId`. It is not an ordinary public read/write API. Provider OAuth, if supported, uses an adapter-specific state/PKCE flow; do not invent one universal token exchange for all coding platforms.

## Verification, costs, automation and deployment

| Method and route | Purpose / request shape | Response data | Profile | Additional errors |
| --- | --- | --- | --- | --- |
| POST `/runs/:runId/verifications` | `{artifactId,suiteRevision}`; criteria from pinned contract | `Operation` → `VerificationReport` | Owner-W | `ARTIFACT_MISMATCH`, `VERIFIER_UNAVAILABLE` |
| GET `/runs/:runId/verifications` | `Page` | `VerificationReport[]` | Owner-R | none |
| GET `/verifications/:reportId` | Criterion evidence and outcome | `VerificationReport` | Owner-R | none |
| GET `/usage` | `Page & {projectId?,runId?,from?,to?,category?}` | `UsageEntry[]` | Owner-R | none |
| GET `/projects/:projectId/budgets` | Active limits and reservations | `Budget[]` | Owner-R | none |
| POST `/projects/:projectId/budgets` | `{scopeKind:project\|run,runId?,limitMicroUsd,reason}` | `Budget` | Owner-H | `BELOW_COMMITTED_SPEND` |
| PATCH `/budgets/:budgetId` | `{limitMicroUsd,reason}` | `Budget` | Owner-H | `BELOW_COMMITTED_SPEND` |
| POST `/projects/:projectId/schedules/preview` | `{expression,timezone,misfirePolicy,overlapPolicy}` | `{normalizedRecurrence,nextOccurrences:string[5],warnings:string[]}` | Owner-W | `AMBIGUOUS_TIME`, `INVALID_RECURRENCE` |
| POST `/projects/:projectId/schedules` | `{goalTemplate,recurrence,timezone,misfirePolicy,overlapPolicy,budgetCeilingMicroUsd,grantIds}` | `Schedule` | Owner-H | `GRANT_INSUFFICIENT`, `BUDGET_REQUIRED` |
| GET `/projects/:projectId/schedules` | `Page` | `Schedule[]` | Owner-R | none |
| PATCH `/schedules/:scheduleId` | `{recurrence?,timezone?,misfirePolicy?,overlapPolicy?}` | `Schedule` | Owner-H | `ACTIVE_OCCURRENCE_CONFLICT` |
| POST `/schedules/:scheduleId/pause` | `{reason}` | `Schedule` | Owner-W | none |
| POST `/schedules/:scheduleId/resume` | `{misfirePolicy}` | `Schedule` | Owner-W | `GRANT_EXPIRED` |
| GET `/schedules/:scheduleId/occurrences` | `Page` | `Occurrence[]` | Owner-R | none |
| POST `/projects/:projectId/triggers` | `{source,eventFilter,goalTemplate,grantIds,secretReferenceId?}` | `Trigger` | Owner-H | `SOURCE_UNSUPPORTED`, `GRANT_INSUFFICIENT` |
| GET `/projects/:projectId/triggers` | `Page` | `Trigger[]` | Owner-R | none |
| PATCH `/triggers/:triggerId` | `{enabled?,eventFilter?}` | `Trigger` | Owner-H | `FILTER_INVALID` |
| POST `/webhooks/:triggerId` | Provider-specific raw signed event | `{accepted:true,deliveryId}`, 202 | Webhook | `SIGNATURE_INVALID`, `REPLAY_REJECTED` |
| GET `/projects/:projectId/events` | `Page & {source?,state?}` | `InboundEvent[]` | Owner-R | none |
| POST `/runs/:runId/deployment-previews` | `{artifactId,targetRef,migrationPlanRef?}` | `Operation` → `DeploymentPreview` | Owner-W | `TARGET_UNSUPPORTED`, `VERIFICATION_REQUIRED` |
| POST `/runs/:runId/deployments` | `{previewId,approvalId,inputDigest}` | `Operation` → `Deployment` | Owner-H | `APPROVAL_REQUIRED`, `PREVIEW_STALE`, `ARTIFACT_MISMATCH` |
| GET `/deployments/:deploymentId` | Target/result/health evidence | `Deployment` | Owner-R | none |
| POST `/deployments/:deploymentId/rollback-previews` | `{reason}` | `DeploymentPreview` | Owner-W | `ROLLBACK_UNAVAILABLE` |
| POST `/deployments/:deploymentId/rollback` | `{previewId,approvalId,inputDigest}` | `Operation` | Owner-H | `APPROVAL_REQUIRED`, `DATA_MIGRATION_IRREVERSIBLE` |
| GET `/activity` | `Page & {projectId?,runId?,type?}` | `ActivityItem[]` | Owner-R | none |
| GET `/notifications` | `Page & {state?}` | `Notification[]` | Owner-R | none |
| POST `/notifications/:notificationId/read` | `{}` | `Notification` | Owner-W | none |

`VerificationReport={id,runId,artifactId,artifactDigest,contractRevisionId,outcome:pass|fail|unknown,criteria:[{criterionId,required,outcome,evidenceArtifactIds,reason}],verifierIdentity,suiteRevision,environmentDigest,checkedAt}`. `UsageEntry={id,operationKey,category,units,pricingRevision,estimatedMicroUsd,actualMicroUsd?,state}`. `Budget={id,scopeKind,scopeId,limitMicroUsd,spentMicroUsd,reservedMicroUsd,version}`.

`Schedule={id,projectId,goalTemplate,recurrence,timezone,misfirePolicy:skip|latest|bounded_catchup,overlapPolicy:skip|queue_one|parallel,nextFireAt,paused,version}`. `Occurrence={id,scheduleId,scheduledFor,state:queued|running|skipped|completed|failed,runId?,reason?}`. `Trigger={id,source,eventFilter,goalTemplate,enabled,version}`. `InboundEvent={id,source,deliveryId,state,receivedAt,payloadDigest,goalId?}`. `goalTemplate={intent,constraints,autonomyMode,contractTemplateRef?,budgetCeilingMicroUsd}`; a template never substitutes for required approval of materially changed scope.

`DeploymentPreview={id,runId,artifactId,targetSummary,changes,migrationPlanRef?,costEstimate,inputDigest,expiresAt,rollbackEligibility,requiredApproval}`. `Deployment={id,runId,artifactId,targetSummary,state,externalReleaseId?,healthReportId?,rollbackRef?}`. `ActivityItem={id,type,projectId?,runId?,safeSummary,traceId,createdAt}`. `Notification={id,channel:local|approved_external,state,summary,artifactIds,createdAt,readAt?}`.

## SSE semantics

`RunEvent={schemaVersion:1,eventId,runId,sequence,type,occurredAt,payload,traceId}`. Event types include `run.state_changed`, `task.state_changed`, `approval.requested`, `artifact.available`, `verification.completed`, `usage.updated`, `run.blocked`. Events contain safe projections, not raw provider streams or credentials.

The SSE `id` is the durable run sequence encoded as a string; it is scoped to the route's run. Allocate sequence under a run-row lock and commit with state change, so sequence order equals visible commit order for that run. Read durable rows after cursor, then poll/listen for more. LISTEN/NOTIFY may wake readers but is never the event store. Heartbeat every 15 seconds; bounded 1 MiB connection buffer; slow clients are disconnected and resume by cursor. Authenticate on reconnect and periodically check revocation. Cursor expired returns 410 with a fresh snapshot URL; client reloads run state and resumes at the returned current sequence. Do not lose events between snapshot and subscription.

## Internal worker protocol

Broker interface (not public HTTP): `claimTask`, `heartbeatTask`, `proposeEffect`, `beginEffect`, `submitReceipt`, `uploadArtifact`, `requestCancellationStatus`. Every envelope contains `{schemaVersion,messageId,connectionId,runId,taskId,runEpoch,taskEpoch,deadlineAt,payloadDigest,payload}` and authenticated channel binding. Server validates scope, lease, replay, deadline, and input digest.

`TaskAssignment={taskContract,contextBundleRef,repositorySnapshotRef,capabilityToken,limits}`. `EffectProposal={toolId,toolRevision,input,inputDigest,targetRef}`. `ExecutionReceipt={effectId,inputDigest,outputArtifactIds,exitCode?,startedAt,endedAt,externalOperationId?,usageRef?,workerImageDigest,signature}`. Heartbeats extend the lease only when epoch and owner match. Receipt replay is idempotent; stale writers cannot change state. Broker stores unsigned/untrusted worker claims as candidate evidence until validation. No protocol message can approve its own effect or set a run to verified.

## End-to-end example contract

Create project → conversation → message → goal → intent/research → requirement revision → plan revision → contract revision → approval request → human approval → repository snapshot → run. Observe SSE and respond to effect approvals. Read verification report for the exact final artifact. Request deployment preview only after required checks pass; approve its separate digest before deployment. This sequence is the API acceptance test for the flagship workflow.
