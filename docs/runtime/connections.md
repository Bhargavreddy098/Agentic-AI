---
title: "Runtime and durable recovery connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F09"
updated: "2026-11-05"
---

# Runtime and durable recovery connections

## Peers

[planning](../planning/index.md), [providers](../providers/index.md), [tools](../tools/index.md), [verification](../verification/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: Assign stable operation identity before dispatch. Persist intent and actual receipt under fenced run ownership. Recovery distinguishes not-started, confirmed-completed, failed and uncertain. Unknown effects require reconciliation; there is no blanket exactly-once guarantee for external actions.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

Kill before/after mutation and receipt persistence; resume cannot duplicate confirmed effect or blindly retry uncertainty. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
