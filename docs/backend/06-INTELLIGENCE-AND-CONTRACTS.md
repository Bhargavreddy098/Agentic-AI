# Intelligence, planning, agents, and Build Contracts

The intelligence layer proposes what should happen. The control plane decides what is authorized, affordable, executable, and verified. This separation is the central product invariant.

## Engine contracts

| Engine | Input | Output | Deterministic checks |
| --- | --- | --- | --- |
| Intent | User messages, existing project summary, explicit preferences | Literal request, desired outcome, constraints, assumptions, material unknowns, success candidates | Every inferred statement labeled; source message references resolve |
| Requirements | Intent, research, answers, existing capabilities | Functional/nonfunctional requirements, exclusions, measurable acceptance criteria | Stable requirement IDs; every must-have has a required criterion; contradictory constraints surfaced |
| Research | Bounded questions, approved network scope, source policy | Claims with primary sources, timestamps, digests, uncertainty, freshness | URLs/refs resolve; retrieved content untrusted; budget/time limit |
| Planning | Requirement revision, capabilities, cost limits | Twenty connected layers plus an executable DAG | DAG acyclic; each leaf has deliverable, dependencies, permission, budget and criterion links |
| Architecture | Requirements, repo snapshot, decision constraints | Alternatives, chosen design, boundaries, tradeoffs, schema/API/deployment plans | Decision record complete; unsupported integrations labeled |
| Decision | Proposal, bounded critiques, evidence | Accepted/challenged/rejected/alternative/user-decision record | Evidence and confidence shown; unresolved high-impact conflicts block contract approval |
| Context | Task, source snapshot, access grants, token ceiling | Versioned context bundle with provenance and trust labels | Scope/privacy check; secrets excluded; token budget enforced |
| Dynamic agent | Task contract, role, available qualified capabilities | Scoped temporary session and structured deliverable | No privilege expansion; fanout/depth/time/token caps |
| Model Router | Task type, hard capability needs, privacy/budget | Eligible candidate ranking and selected model revision | No fallback outside hard constraints |
| Orchestrator | Approved immutable contract, events, receipts | Durable task transitions, effect requests, verification requests | State machine and policy enforced without LLM discretion |

Store outputs as versioned artifacts plus relational projections. Model output must parse against a strict schema, then pass domain checks. One bounded schema-repair attempt may correct formatting; semantic contradictions go back to planning. Invalid output is not silently coerced into an approval-ready contract.

## Clarification policy

Ask when an answer changes material scope, architecture, privacy, cost, irreversible actions, user experience, or implementation strategy. Score each unknown by impact and reversibility, record the score/reason, and bundle related questions. Infer low-risk choices such as a conventional folder name and disclose them. Never infer paid purchases, production data changes, external communication, or permission to expose confidential source to a provider.

For an e-commerce platform, payment provider and multi-vendor payout requirements are material; the internal name of the cart module is not. If a critical answer is absent, produce a partial plan with an explicit blocker. Do not treat silence as approval. User answers are new evidence; they do not rewrite previously approved revisions.

## Twenty planning layers

Each layer has `{schemaVersion,summary,decisions,sourceRefs,risks,dependencies,acceptanceRefs}` and its domain fields below. A layer may be `not_applicable` with a reason; it may not be silently omitted.

| Layer | Required content |
| --- | --- |
| Intent | Outcome, stakeholder, constraints, material unknowns |
| Product strategy | Personas, value proposition, success metrics, justified scope |
| Requirements | Must/should/could, exclusions, criterion references |
| UX | User flows, error/empty/loading states, accessibility requirements |
| Functional architecture | Capabilities and ownership; interaction map |
| Technical architecture | Runtime/deployment boundaries, dependency direction |
| Data | Entities, access isolation, constraints, indexes, retention |
| API | Operations, DTOs, auth, errors, async semantics |
| AI | Tasks, provider capabilities, prompts, evaluation and failure limits |
| Integrations | Supported surfaces, auth, quotas, unavailable features |
| Security | Threats, controls, trust boundaries, capability grants |
| Infrastructure | Target resources, isolation, network, storage, recovery |
| Implementation | DAG, per-step deliverable, ownership, estimates |
| Testing | Unit/integration/security/end-to-end test ownership |
| Verification | Required evidence, independent checks, completion logic |
| Deployment | Target, preflight, approvals, release and rollback |
| Operations | Health, logs, backups, incident and retention procedures |
| Cost | Infrastructure/model/tool estimates, reservations, hard limits |
| Risk | Probability/impact, detection, mitigation and unresolved assumptions |
| Maintenance | Dependency updates, schema evolution, knowledge refresh and schedules |

Executive projection shows goal, scope, major choices, cost, risks and approval consequences. Detailed projection exposes the layers. Task/evidence views expose exact source revisions and execution receipts. Backend response projections should support this progressive disclosure without hiding material decisions.

## Build Contract schema

The server owns envelope fields: `{id,contractId,revision,schemaVersion,canonicalizerVersion,digest,createdAt,createdBy,supersedesId?}`. The following `BuildContractInput` is required; empty arrays require an explicit documented reason where relevant.

| Field | Shape / validation |
| --- | --- |
| `goal` | `{goalId,title,problemDefinition,expectedOutcome,successMetrics:[{name,target,method}]}` |
| `assumptions` | `[{key,statement,risk,sourceRefs,acceptedBy?}]`; material unresolved assumptions prevent approval |
| `unresolvedQuestions` | `[{id,question,material:boolean,owner,blocking:boolean}]`; no blocking entries at approval |
| `personas` | `[{id,description,needs,accessBoundaries}]` |
| `requirements` | `{revisionId,digest,functionalIds,nonfunctionalIds}`; references immutable requirement set |
| `exclusions` | `[{description,reason}]`; visible in approval projection |
| `technologyStack` | `[{component,selectedTechnology,versionPolicy,rationale,decisionRef}]` |
| `architecture` | `{planRevisionId,planDigest,moduleBoundaries,trustBoundaries,decisionRefs}` |
| `database` | `{schemaRevisionRef,migrationStrategy,retentionPolicy,backupPlan,accessPolicy}` |
| `apis` | `{contractRevisionRef,operations,authentication,versioning}` |
| `integrations` | `[{name,adapterKind,supportedSurface,capabilities,limitations,authReference}]` |
| `modelStrategy` | `{routingPolicyRevision,allowedProviders,privacyClass,maxContextTokens,fallbackRules}` |
| `tools` | `[{toolId,revision,capabilities,resourceScope,timeoutMs}]` |
| `permissions` | `{grantRefs,workspaceRoots,networkAllowlist,deniedActions,highImpactApprovalRules}` |
| `cost` | `{currency,modelEstimateRange,infrastructureEstimateRange,toolEstimateRange,projectCeilingMicroUsd,runCeilingMicroUsd,pricingRefs,uncertainty}` |
| `risks` | `[{id,description,probability,impact,mitigation,detection,owner}]` |
| `security` | `{classification,providerDataRules,secretPolicy,sandboxProfile,threatModelRef}` |
| `implementation` | `{planRevisionId,phaseKeys,taskDagDigest,deadlinePolicy,repairLimits}` |
| `acceptance` | `{requirementRevisionId,requiredCriterionIds,optionalCriterionIds}` |
| `verification` | `{suiteRevision,verifierPolicyRevision,evidenceRequirements,productQualityRubric,performanceTargets}` |
| `deployment` | `{requested:boolean,targetRef?,preflightRequirements,approvalRequired:true,rollbackPlanRef?}` |
| `autonomyMode` | `plan_only\|ask_before_every_change\|autonomous_coding\|full_autonomous_build` |
| `changePolicy` | `{materialChangeRules,notificationRules,revisionRequired:true}` |
| `completionDefinition` | `{requiredArtifacts,requiredReports,remainingLimitationsPolicy}` |

Descriptions are bounded strings; arrays have explicit maximum sizes during schema implementation. Cost ranges contain low/high numbers with units and evidence date. A zero estimate cannot mean “unknown.” Unknown prices are labeled and a conservative user ceiling is required before spending.

## Revision and approval protocol

1. Validate semantic completeness and cross-references.
2. Canonicalize with a pinned implementation of a documented canonical JSON format: normalize no user text, reject non-finite numbers, use decimal strings for money, deterministic key ordering/encoding. Store canonicalizer version and actual immutable canonical bytes.
3. Compute SHA-256 over the canonical envelope content, including requirement/plan digests, permissions, costs, tools, model policy and autonomy mode. Exclude only non-authoritative display metadata explicitly named by the schema.
4. Store immutable revision and an approval request binding that digest, policy revision, designated approver, nonce and expiry.
5. The owner sees the exact revision/diff and approves it through an authenticated channel. Agent-generated “approved” text has no authority.
6. Start runs only with matching revision/digest and current non-revoked grants. A contract approval may authorize multiple runs only within its explicitly approved recurrence/repetition limits.
7. Material changes create a new plan/contract revision and a diff. Pause affected execution and obtain approval; leave old evidence bound to the old revision.

Material changes include scope, required criteria, technology/architecture, data sharing, external target, permissions, cost ceiling, security boundaries, destructive migrations, or deployment behavior. A typo in a non-authoritative display label can be updated separately without altering approved bytes. Do not classify semantic changes as cosmetic to avoid approval.

## Four autonomy modes

| Mode | Planning/research | Repository mutation | External sensitive actions |
| --- | --- | --- | --- |
| Plan only | Allowed within privacy/network/budget grants | Denied; system may persist its own plans/evidence | Denied |
| Ask before every change | Allowed within grants | Each material action/diff requires specific approval | Separate explicit approval |
| Autonomous coding | Allowed | Approved contract's workspace changes and tests allowed in qualified isolation | Separate explicit approval |
| Full autonomous build | Allowed | Approved tasks within scoped permissions and cost allowed | Still separately approved |

High-impact actions always include production deployment, public publishing, protected-branch merges, purchases/financial transactions, external communications, important deletions, production data mutations, paid service creation, DNS changes, and critical credential rotation. Broad contract approval never silently absorbs these effects.

## Specialists and structured debate

Roles are prompt/contract specializations hosted in bounded sessions. Most planning roles can be lightweight model calls. Tool-capable roles require isolated execution and stronger grants. Do not run twenty daemon agents because there are twenty planning layers.

Creation input: role, task ID, deliverable schema, context bundle ID, capabilities, token/cost/time limits, max delegation depth, and independence requirement. Lifecycle: proposed → policy checked → active → deliverable submitted → reviewed → terminated. On termination revoke capability tokens, settle usage, persist safe summary and source refs, destroy ephemeral context.

Debate record: proposal → one critique per selected specialty → counterproposal → cited evidence → risk comparison → decision. Default maximum two rounds and three specialists; stop earlier when constraints decide the choice. Confidence is a calibrated assessment field, not a vote weighted by eloquence. Tie-break on hard requirements, safety, measured evidence, reversibility, cost, then owner decision if the choice remains material. No recursive debate without a new bounded task.

Measure agent benefit using identical fixtures: correctness, omissions, independent defects caught, latency, tokens and cost versus single-role baseline. Enable an extra role only when its improvement exceeds an explicit product threshold. Architecture/security review of a high-impact plan is a plausible use; trivial renaming is not.

## Context and research controls

Context priority: authenticated user constraints → approved contract and policy summaries → current task/criteria → exact repository evidence → relevant decisions/failures → selected retrieved knowledge. Source documents carry trust labels; instructions found in a repository or webpage do not become platform policy. Record source revisions so a run can explain its decisions later.

Research calls fetch official documentation where possible and record retrieval time, content digest, claim, citation and limitations. Cache by URL plus content digest/freshness class. A price or provider capability needs a shorter freshness window than a language concept. Unsupported vendor integration remains unavailable until supported authentication and behavior are demonstrated.
