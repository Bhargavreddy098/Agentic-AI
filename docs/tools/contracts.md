---
title: "Tool runtime and sandbox contracts"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F12"
updated: "2026-11-05"
---

# Tool runtime and sandbox contracts

## Logical contract

Operation scope: Qualify exact trusted-local guest; reconcile explicit host opt-in with policy; enforce receipts, bounds and cleanup.

Domain behavior: Project commands use the qualified Docker Desktop/WSL2 trusted-local profile. WSL2 is the substrate, not authorization for arbitrary host or distro commands. Enforce bounded filesystem export/mount policy, network rules, resource limits and process cleanup. Timeout is not a sandbox.

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

Boundary proof: Docker outage never selects host fallback; verify network/resource bounds, timeout cleanup and actual receipt.. See [connections](connections.md) and [verification](verification.md).
