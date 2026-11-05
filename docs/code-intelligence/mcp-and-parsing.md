---
title: "MCP and code intelligence — mcp and parsing"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F13"
updated: "2026-11-05"
---

# MCP and code intelligence — mcp and parsing

## How it works

MCP discovery returns capability descriptions but grants no execution authority. Validate tool schemas and responses, scope server registration, bound output and cancellation. Search/parsing indexes are tied to project revision; stale results are identified.

## Integration

[tools](../tools/index.md), [workspace](../workspace/index.md). The operation uses the same canonical owner whether initiated by UI, CLI or an authorized automation. Transport handlers decode and authorize; they do not establish a competing business state machine.

## Failure and restart

Persist identifiers and outcomes needed to distinguish no effect, completed effect and uncertainty. Retry only the documented idempotent case. If revision, target or authority changed, obtain a new decision before acting. Clean up bounded resources without deleting unrelated user state.

## Acceptance

Unauthorized server/tool rejected; real ripgrep and Tree-sitter results; malformed/oversized response bounded.

Implement and verify this mechanism through [contracts](contracts.md), [implementation](implementation.md) and [verification](verification.md). Exact wire/schema decisions require the contract task; all runtime evidence is currently NOT RUN.
