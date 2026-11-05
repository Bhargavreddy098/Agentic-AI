---
title: "Model providers connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F04"
updated: "2026-11-05"
---

# Model providers connections

## Peers

[security](../security/index.md), [routing](../routing/index.md), [sessions](../sessions/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: Adapters preserve exact model identifiers and normalize text, tools, usage and terminal outcomes. Abort flows from user request through coordinator to upstream. Partial output is stored as interrupted; a new provider cannot silently replay already executed effects.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

Real authorized model response; 401/429/timeout/stream truncation controls; cancellation releases lease. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
