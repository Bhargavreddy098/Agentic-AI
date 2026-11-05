---
title: "Workspace Git and artifacts connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F11"
updated: "2026-11-05"
---

# Workspace Git and artifacts connections

## Peers

[security](../security/index.md), [approvals](../approvals/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: Resolve canonical root and target including Windows junctions. Preview changes against a base digest; approval binds that preview. At application recheck target and digest. Preserve user edits on conflict; record resulting artifact digest. Git commit/push are separate effects.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

Cross-drive/junction escapes fail; modify base after preview and confirm refusal without overwriting unrelated edits. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
