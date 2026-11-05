---
title: "MCP and code intelligence connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F13"
updated: "2026-11-05"
---

# MCP and code intelligence connections

## Peers

[tools](../tools/index.md), [workspace](../workspace/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: MCP discovery returns capability descriptions but grants no execution authority. Validate tool schemas and responses, scope server registration, bound output and cancellation. Search/parsing indexes are tied to project revision; stale results are identified.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

Unauthorized server/tool rejected; real ripgrep and Tree-sitter results; malformed/oversized response bounded. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
