---
title: "Testing strategy"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Testing strategy

Unit tests cover deterministic validation and policy. Contract tests cover schemas, errors, event compatibility and native IPC. Integration tests exercise actual services and isolated SQLite. End-to-end tests trigger the real UI/CLI path and inspect authoritative outcomes.

Controlled provider doubles are useful for rate-limit, timeout and interrupted-stream scenarios. They are not proof of real inference. A fabricated guest receipt is not sandbox qualification. Browser QA must use actual browser observations; missing adapters report unavailable.

Each scenario records requirement, source revision, command, environment, isolated target, boundary exercised, actual outcome and sanitized evidence. Required missing evidence is UNKNOWN. Design docs and installed libraries do not imply implementation completion.

Read [writing tests](writing-tests.md), [test environments](environments.md) and each feature verification.md before implementation. All scenarios in this library are NOT RUN.
