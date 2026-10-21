# ASI service catalog

Status: **proposed ownership map**. No service processes exist yet. The current
implementation is the single Express application in `backend/` (port 4400);
it is an implementation input, not the target service set, and it remains in
place until service packages consume their modules correctly.

See [`services.json`](services.json) for the machine-readable map and
[`../../superpowers/plans/2026-10-21-asi-microservices-build.md`](../../superpowers/plans/2026-10-21-asi-microservices-build.md)
for the build plan.

## Ports

| Service | Package | Local port | Durable store |
| --- | --- | --- | --- |
| API Gateway | `@asi/service-api-gateway` | 4400 | None directly |
| Core | `@asi/service-core` | 4410 | Private PostgreSQL `asi_core` |
| Memory | `@asi/service-memory` | 4420 | Private PostgreSQL `asi_memory` + pgvector |
| Episode | `@asi/service-episode` | 4430 | Exclusive local SQLite |
| Inference | `@asi/service-inference` | 4440 | No domain database initially |
| Orchestrator | `@asi/service-orchestrator` | 4450 | Canonical workflow state via Core |
| Tool Runtime | `@asi/service-tool-runtime` | 4460 | Canonical effects via Core |
| Specialist | `@asi/service-specialist` | 4470 | Canonical tasks/results via Core |

Ports are proposed local defaults, configurable and checked for availability
before startup. Nothing unrelated may be stopped to obtain a port.

## Ownership rules

- A service may import its own domain modules, pure contracts and transport
  clients.
- A service may not import another service's models, controllers, runtime
  entry, provider SDKs or private repositories.
- Data access is through the owning service, with separate database
  credentials. No service may write another service's authoritative table.
- Logical ASI component classifications are preserved inside services.
- Core keeps identity/policy/budgets/audit and run/effect coordination
  together until their coordinated transaction rules are defined and tested.
- Stateless services do not receive a database just to make every folder
  identical.

## Current state

`backend/services/` contains three service files
(`capabilities.service.js`, `catalog.service.js`, `conversation.service.js`)
that are shared helpers of the monolith, not independent service processes.
The eight target service directories do not exist. Per the build plan, they
are not scaffolded empty merely to satisfy file-count checks.

## Negative architecture

`tests/services/ownership.test.ts` enforces the ownership rules statically:
every existing module maps to exactly one service, no service imports another
service's private modules, no unauthorized SQL/provider imports appear, and no
credential is present outside its named owner.

## Integration-only coverage

- **Task 30** — cross-service integration/release gate.
- **V2-G01** — protected goal-to-artifact V2 workflow, cross-service
  integration/release gate.

All 50 source task IDs remain covered. Model completion never changes an
original/V2 feature status until that task's complete source acceptance
passes.