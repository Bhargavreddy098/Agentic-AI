---
title: "Observability and evaluations connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F20"
updated: "2026-11-05"
---

# Observability and evaluations connections

## Peers

[sessions](../sessions/index.md), [runtime](../runtime/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: Correlate request/run/effect/model activity without secret payloads. Derive costs from actual usage and diagnostics from real probes. Unknown is distinct from healthy. Retention and exported diagnostics are explicit and scoped.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

Inject secret canaries and missing probes; no leakage or fabricated healthy/security flags. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
