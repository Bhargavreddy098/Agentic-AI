---
title: "Desktop shell and security contracts"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F22"
updated: "2026-11-05"
---

# Desktop shell and security contracts

## Logical contract

Operation scope: Preserve window.sirona bridge; qualify readiness, trusted senders, startup/shutdown and restart.

Domain behavior: Electron main owns native capabilities; preload is a narrow typed allowlist. Authenticate sender origin/frame before action. Renderer never receives generic shell/fs or decryption. Backend startup/readiness and window lifecycle expose truthful states.

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

Boundary proof: Forged sender denied; restart restores session; stopped backend shows unavailable; owned processes cleaned.. See [connections](connections.md) and [verification](verification.md).
