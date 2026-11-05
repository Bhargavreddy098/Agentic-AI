---
title: "Routing and budgets contracts"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F05"
updated: "2026-11-05"
---

# Routing and budgets contracts

## Logical contract

Operation scope: Unify capability eligibility and budget reservation/settlement; forbid replay after partial side effects.

Domain behavior: Before inference reserve a bounded budget against eligible routes. Settle reported usage once using durable operation identity. Unreported usage is unknown, not zero. Failed or cancelled requests reconcile reservation state. Fallback must satisfy capabilities and remaining authority.

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

Boundary proof: Race two reservations, cancel an active request and repeat settlement; no double debit or unauthorized spend.. See [connections](connections.md) and [verification](verification.md).
