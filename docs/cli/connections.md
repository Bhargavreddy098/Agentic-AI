---
title: "CLI and headless consumers connections"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F24"
updated: "2026-11-05"
---

# CLI and headless consumers connections

## Peers

[gateway](../gateway/index.md), [security](../security/index.md).

## End-to-end handoff

1. UI/CLI or authorized internal trigger submits a scoped request.
2. Gateway/native boundary validates identity and decodes the contract.
3. Domain owner applies: CLI parses explicit arguments, authenticates and calls the same API as UI. It owns no direct database or privileged execution route. Noninteractive operation cannot auto-approve effects. Stable JSON output and exit codes distinguish denied, unavailable and failed.
4. Consult direct dependency readiness and current action policy.
5. Execute only permitted work through the qualified boundary.
6. Persist actual outcome and stable receipt/event identifiers.
7. Render the result in the initiating consumer; reconnect queries durable state rather than reissuing mutations.

## Cross-domain failure behavior

A failed prerequisite produces explicit blocked/unavailable status. A duplicate event consults operation identity. Cancellation stops new dispatch and propagates abort; uncertain completion is reconciled before retry. Notification or rendering failures do not justify rerunning business effects.

## Integration scenario

Same operation via CLI/UI yields same state; SIGINT cancels; missing authority exits safely without mutations. Follow the [system journeys](../journeys/index.md); verify consumer state agrees with authoritative state. Never treat client API wrappers as proof of completed UI integration.
