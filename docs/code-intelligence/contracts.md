---
title: "MCP and code intelligence contracts"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F13"
updated: "2026-11-05"
---

# MCP and code intelligence contracts

## Logical contract

Operation scope: Authorize actual MCP dispatch; qualify guest ripgrep, Tree-sitter and LSP using pinned artifacts.

Domain behavior: MCP discovery returns capability descriptions but grants no execution authority. Validate tool schemas and responses, scope server registration, bound output and cancellation. Search/parsing indexes are tied to project revision; stale results are identified.

| Contract concern | Required semantics |
|---|---|
| Caller | Authenticated principal; trusted internal identity for service-to-service use |
| Scope | Workspace plus project/session/run where applicable; checked by owner |
| Input | Typed operation data; bounded size; no caller-owned risk/lease authority |
| Output | Actual state/result with stable identity; unknown and unavailable explicit |
| Mutations | Expected revision/digest when needed; durable operation identity for replay |
| Cancellation | Propagates to executing boundary; completed effects remain recorded |
| Events | Attributed progress and terminal state; replay sequence for durable streams |
| Secrets | Opaque references only; no credential values returned to consumers |

## Compatibility

When integrating existing source, inventory registered /api/v1 operations first. Reuse compatible endpoints; do not create duplicates from old docs. Preserve established wire semantics and make breaking changes explicit. Unknown additive fields can be ignored safely; malformed known fields are errors.

## Exact wire-specification gate

Before coding an operation, its contract task must record exact method/schema, validation limits, error codes, event names, persistence delta and version compatibility. Those details are not falsely claimed finalized in this architecture library. No DDL or endpoint is authorized by this page.

Boundary proof: Unauthorized server/tool rejected; real ripgrep and Tree-sitter results; malformed/oversized response bounded.. See [connections](connections.md) and [verification](verification.md).
