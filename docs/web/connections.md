---
title: "Frontend product surfaces connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F23"
updated: "2026-11-05"
---

# Frontend product surfaces connections

## Peers

[gateway](../gateway/index.md), [runtime](../runtime/index.md), [workspace](../workspace/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: React owns drafts/tabs and renders canonical server state. Editor, diff, terminal, plan, approvals and monitoring use actual APIs. Use Zustand for client state and TanStack Query for server cache where justified; React Flow projects recorded tasks. Preserve compact design.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

No hardcoded provider/workspace success; reconnect restores state without dispatching twice; keyboard/accessibility flows work. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
