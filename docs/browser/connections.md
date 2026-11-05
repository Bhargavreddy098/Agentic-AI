---
title: "Browser and computer runtime connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F18"
updated: "2026-11-05"
---

# Browser and computer runtime connections

## Peers

[tools](../tools/index.md), [approvals](../approvals/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: Create bounded isolated browser profiles; navigation/read versus upload/download/account changes have different permissions. Page content is untrusted. Actual browser observations produce evidence; absence of adapter returns unavailable. Computer control needs separate narrow targeting.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

Unconfigured browser cannot claim success; denied sensitive action causes no effect; profile and child resources cleaned. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
