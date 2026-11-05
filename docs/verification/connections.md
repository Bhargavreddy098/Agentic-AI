---
title: "Verification and quality connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F15"
updated: "2026-11-05"
---

# Verification and quality connections

## Peers

[planning](../planning/index.md), [tools](../tools/index.md), [workspace](../workspace/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: Only trusted checker execution can certify a criterion. Bind receipt to artifact, environment and approved criterion revision. Missing required checks yield UNKNOWN. Producer-provided pass strings and synthetic logs are not evidence. Bounded repair must rerun affected checks.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

Delete required receipt, substitute artifact digest and induce checker failure; no case produces PASS. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
