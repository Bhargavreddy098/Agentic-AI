# ASI microservices model ownership — proposed

This companion to the [migration plan](superpowers/plans/2026-10-21-asi-microservices-migration.md) reassigns the existing 43 model families across the proposed service boundaries. It does not create services or models and does not mark feature tasks complete. A producer creates evidence/input; only the primary model owner writes the canonical record.

## Existing module placement

| Existing module | Target service | Boundary |
| --- | --- | --- |
| control | core | Runs, leases, checkpoints, effects, outboxes and metadata persistence |
| identity | core | Verified identity, grants/revocation and signing |
| policy | core | Policy decisions, approvals and execution bindings |
| budgets | core | Atomic quota/reservation/settlement |
| audit | core | Signed receipt persistence and safe decision projection |
| skills | core / orchestrator | Split authoritative catalog/trust/install persistence into Core and pure selection into Orchestrator; do not share a Core repository package |
| orchestrator | orchestrator | Workflow/retry/recovery coordination through typed clients |
| context | orchestrator | Context construction and trust handling |
| memory | memory | Scoped vector/relational memory and revisions |
| episodic | episode | Exclusive local SQLite episode owner |
| privacy | inference | Privacy eligibility and permitted provider routing |
| models | inference | Generation/embedding provider integration |
| tools | tool-runtime | Trusted registry and governed dispatch |
| protocols | tool-runtime | MCP/A2A protocol clients and exact scope checks |
| sandbox | tool-runtime | Trusted isolation interface; untrusted handlers remain in separately qualified sandbox |
| specialists | specialist | Bounded specialist worker tasks and measurements |
| gateway | api-gateway / core | Split HTTP/UI shaping/stream transport into Gateway; canonical ingress, scheduling, session and delivery state into Core |
| channels | api-gateway | Channel/webhook transport; durable acceptance/delivery state via Core |
| telemetry | shared narrow instrumentation | Only instrumentation/redaction helpers; no shared domain repositories or credentials |

## Model family placement

| Model family | Source tasks | Primary model/API owner | Persistent data owner | Typical producer |
| --- | --- | --- | --- | --- |
| skill | 18, V2-T05 | core | core | core |
| channel-delivery | 20 | core | core | api-gateway / orchestrator |
| protocol-connection | 22 | core | core | tool-runtime |
| remote-task | 23 | core | core | tool-runtime |
| fleet-assignment | 24 | core | core | orchestrator |
| restore-report | 25 | core | core | core |
| consolidation-candidate | 26 | memory | memory | memory |
| tool-candidate | 27 | core | core | tool-runtime |
| observation | 28, V2-T22 | memory | memory | memory |
| scaffold-candidate | 29 | core | core | orchestrator |
| task-plan | V2-T02 | core | core | orchestrator |
| critique-report | V2-T03 | core | core | orchestrator |
| skill-selection | V2-T06 | orchestrator | none: projection | orchestrator |
| agent-definition | V2-T07 | core | core | orchestrator |
| agent-lifecycle | V2-T08 | core | core | orchestrator |
| trigger | V2-T09 | core | core | api-gateway / orchestrator |
| schedule | V2-T10 | core | core | api-gateway / orchestrator |
| approval-quorum | V2-T11 | core | core | core |
| resource-grant | V2-T12 | core | core | core |
| action-preview | V2-T13 | core | core | tool-runtime |
| compensation-plan | V2-T14 | core | core | orchestrator |
| recovery-plan | V2-T15 | orchestrator | none: projection | orchestrator |
| worker-score | V2-T16 | specialist | none: projection | specialist |
| candidate-comparison | V2-T17 | core | core | orchestrator |
| debate-report | V2-T18 | core | core | orchestrator |
| budget-allocation | V2-T19 | core | core | core |
| context-bundle | V2-T20 | orchestrator | none: projection | orchestrator |
| memory-lifecycle | V2-T21 | memory | memory | memory |
| memory-branch | V2-T23 | memory | memory | memory |
| credential-binding | V2-T24 | core | core | core |
| project | V2-T25 | core | core | orchestrator |
| workspace-lease | V2-T26 | core | core | core |
| artifact | V2-T27 | core | core | tool-runtime |
| specialist-task | V2-T28, V2-T29, V2-T30, V2-T31 | core | core | specialist |
| security-alert | V2-T32 | core | core | specialist |
| trust-label | V2-T33 | orchestrator | none: projection | orchestrator |
| decision-summary | V2-T34 | core | core | core |
| replay-view | V2-T35 | core | core | core |
| simulation-report | V2-T36 | core | core | orchestrator |
| agent-version | V2-T37 | core | core | orchestrator |
| agent-release | V2-T38 | core | core | orchestrator |
| model-routing | V2-T39 | inference | none: projection | inference |
| swarm-plan | V2-T40 | core | core | orchestrator |

## Ownership details

- **skill:** proposed path `backend/services/core/src/models/skill.model.js`. Core owns catalog/trust/install metadata; Orchestrator selects; executable skills run in Tool Runtime.
- **channel-delivery:** proposed path `backend/services/core/src/models/channel-delivery.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **protocol-connection:** proposed path `backend/services/core/src/models/protocol-connection.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **remote-task:** proposed path `backend/services/core/src/models/remote-task.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **fleet-assignment:** proposed path `backend/services/core/src/models/fleet-assignment.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **restore-report:** proposed path `backend/services/core/src/models/restore-report.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **consolidation-candidate:** proposed path `backend/services/memory/src/models/consolidation-candidate.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **tool-candidate:** proposed path `backend/services/core/src/models/tool-candidate.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **observation:** proposed path `backend/services/memory/src/models/observation.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **scaffold-candidate:** proposed path `backend/services/core/src/models/scaffold-candidate.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **task-plan:** proposed path `backend/services/core/src/models/task-plan.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **critique-report:** proposed path `backend/services/core/src/models/critique-report.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **skill-selection:** proposed path `backend/services/orchestrator/src/models/skill-selection.model.js`. Owner projection over scoped remote contracts; no independent authoritative database.
- **agent-definition:** proposed path `backend/services/core/src/models/agent-definition.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **agent-lifecycle:** proposed path `backend/services/core/src/models/agent-lifecycle.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **trigger:** proposed path `backend/services/core/src/models/trigger.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **schedule:** proposed path `backend/services/core/src/models/schedule.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **approval-quorum:** proposed path `backend/services/core/src/models/approval-quorum.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **resource-grant:** proposed path `backend/services/core/src/models/resource-grant.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **action-preview:** proposed path `backend/services/core/src/models/action-preview.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **compensation-plan:** proposed path `backend/services/core/src/models/compensation-plan.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **recovery-plan:** proposed path `backend/services/orchestrator/src/models/recovery-plan.model.js`. Owner projection over scoped remote contracts; no independent authoritative database.
- **worker-score:** proposed path `backend/services/specialist/src/models/worker-score.model.js`. Read measured telemetry and Core eligibility evidence; ranking cannot override current grants/policy.
- **candidate-comparison:** proposed path `backend/services/core/src/models/candidate-comparison.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **debate-report:** proposed path `backend/services/core/src/models/debate-report.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **budget-allocation:** proposed path `backend/services/core/src/models/budget-allocation.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **context-bundle:** proposed path `backend/services/orchestrator/src/models/context-bundle.model.js`. Owner projection over scoped remote contracts; no independent authoritative database.
- **memory-lifecycle:** proposed path `backend/services/memory/src/models/memory-lifecycle.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **memory-branch:** proposed path `backend/services/memory/src/models/memory-branch.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **credential-binding:** proposed path `backend/services/core/src/models/credential-binding.model.js`. Opaque metadata in Core; raw provider secrets stay Inference-only and effect secrets resolve only in trusted execution infrastructure.
- **project:** proposed path `backend/services/core/src/models/project.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **workspace-lease:** proposed path `backend/services/core/src/models/workspace-lease.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **artifact:** proposed path `backend/services/core/src/models/artifact.model.js`. Core owns metadata and durable registered bytes; runtime produces candidate artifacts via authenticated bounded transfer.
- **specialist-task:** proposed path `backend/services/core/src/models/specialist-task.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **security-alert:** proposed path `backend/services/core/src/models/security-alert.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **trust-label:** proposed path `backend/services/orchestrator/src/models/trust-label.model.js`. Pure trust labels also enforced at every receiving service boundary; labels never grant authority.
- **decision-summary:** proposed path `backend/services/core/src/models/decision-summary.model.js`. Read-only projection of Core-owned records; no new writer.
- **replay-view:** proposed path `backend/services/core/src/models/replay-view.model.js`. Read-only projection of Core-owned records; no new writer.
- **simulation-report:** proposed path `backend/services/core/src/models/simulation-report.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **agent-version:** proposed path `backend/services/core/src/models/agent-version.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **agent-release:** proposed path `backend/services/core/src/models/agent-release.model.js`. Canonical mutations through the owning service API; producers have no direct database access.
- **model-routing:** proposed path `backend/services/inference/src/models/model-routing.model.js`. Owner projection over scoped remote contracts; no independent authoritative database.
- **swarm-plan:** proposed path `backend/services/core/src/models/swarm-plan.model.js`. Canonical mutations through the owning service API; producers have no direct database access.

## Existing service responsibilities beyond the unfinished-model list

Episode owns the existing episode/compression/replay storage even though it has no new family in the unfinished-task model catalog. API Gateway owns public transport/controllers but does not own business-record persistence. All eight service boundaries therefore matter; the number of proposed model families does not determine the number of services.

## Integration-only coverage

- **30: Full conformance and handoff** — cross-service integration/release gate; no artificial CRUD model/table.
- **V2-G01: Protected goal-to-artifact V2 workflow** — cross-service integration/release gate; no artificial CRUD model/table.

All 50 source task IDs remain covered: 48 through these model families and two through explicit integration gates. Per-service models/stored-record schemas come first, then domain services and public/internal controllers; the proposed centralized file paths and migration assignments are not executed before service placement is accepted.
