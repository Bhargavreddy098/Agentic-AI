# ASI documentation

ASI targets a local Windows agent workspace with no user RBAC. Existing agent capability checks, privacy, approvals and data ownership remain part of the design. The current implementation is the Express application and domain/worker modules; eight independent microservices are proposed, not deployed.

## Read these first

| Need | Document |
| --- | --- |
| Run the existing backend | [Backend setup](../backend/README.md) |
| Build the proposed backend | [Microservices build plan](superpowers/plans/2026-10-21-asi-microservices-build.md) |
| Understand service boundaries and migration | [Microservices architecture](superpowers/plans/2026-10-21-asi-microservices-migration.md) |
| Find the owner of a model | [Service/model ownership](asi-microservices-model-ownership.md) |
| Check what was actually tested | [Express migration evidence](release-evidence/express-backend-migration.md) |
| Run the synthetic UI | [Gateway demo guide](gateway-demo-guide.md) |

The first engineering milestone is one authenticated, durable conversation/goal operation through Gateway and Core, surviving restart. Product capabilities remain hidden/unavailable until their real owners qualify. Creating model files or healthy listeners does not finish the product.

## Requirements and machine-readable catalogs

- [Original task ledger](task-ledger.json) and [V2 task ledger](v2-task-ledger.json): requirements, dependencies and recorded evidence. Historical completed labels can still carry qualification limits.
- [Remaining-task model coverage](asi-backend-model-coverage.json): all 50 unfinished task entries and their source contract requirements.
- [Model contract catalog](asi-backend-model-implementation-map.json): retained field/interface reference from the earlier model proposal. Its centralized file locations and proposed storage placement are historical; current service placement comes from the service/model ownership map.
- [Service/model ownership data](asi-microservices-model-ownership.json): service-local placement for all 43 model families and two integration gates.
- [Service catalog](service-catalog/services.json): proposed service packages, ports and ownership restrictions. Service processes and the planned ownership test suite have not been implemented.
- [Model design](superpowers/specs/2026-10-21-asi-backend-models-design.md): record integrity, validation and owner rules retained across the service migration.

## Operations and decisions

Keep [Windows platform scope](decisions/0004-windows-only-current-release.md), [Express layout decision](decisions/0005-express-backend-layout.md), other recorded decisions and the [control](runbooks/control.md), [identity](runbooks/identity.md), [audit](runbooks/audit.md), [recovery](runbooks/recovery.md), [observability](runbooks/observability.md) and [channel](runbooks/channels.md) runbooks. A runbook describes its named scope; it does not prove that every integration is currently qualified.

The [OpenClaw integration proposal](superpowers/plans/2026-10-21-openclaw-asi-integration.md) and [source-import notes](../third_party/openclaw/ASI-IMPORT.md) remain relevant. Imported source is not a complete running ASI frontend.

## Historical and optional reference

The original 2026-10-06 specs/plans, research reports, [V2 build guide](v2-build-guide.md), archived source manifest and earlier decision/evidence files remain because they preserve requirements, provenance and checks used by repository validation. They are historical inputs; use the current build plan to choose implementation order and service locations.

[Product brief](../founder/idea.md), [business review summary](../founder/board.md) and [validation experiment](../founder/board/validation.md) are optional product-discovery references. They contain hypotheses, not engineering instructions or measured demand.

Superseded centralized-model batch plans, duplicate Markdown exports, the stale local review, a temporary execution diary and repetitive business-review lenses were removed. Their prior versions remain available in Git history. Upstream OpenClaw documentation, licenses/notices and agent/framework guidance are retained.
