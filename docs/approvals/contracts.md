---
title: "Approvals and governance contracts"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F08"
updated: "2026-11-05"
---

# Approvals and governance contracts

## Logical contract

Operation scope: Server-classified risk and exact action proofs; preserve legacy mode wire values with explicit four-mode mapping proposal.

Domain behavior: Classify risk in trusted code, bind permission to exact action/target/input digest and current principal. Pending, approved, rejected, expired and consumed are distinct. Approval display is derived from the same descriptor used by execution.

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

Boundary proof: Spoof risk/actor, alter target after approval, replay proof and revoke authority; deny before any effect.. See [connections](connections.md) and [verification](verification.md).
