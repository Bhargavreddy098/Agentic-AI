> **V2 consolidation (2026-10-07):** Read [the unified V2 build guide](v2-build-guide.md) for the combined target, completed-task migrations and extension task cards. This file remains a source record; its historical status prose is not current completion evidence. New V2 boundaries await recorded review.

# Gateway demo and current implementation

This fixture exercises the approved UI contract. It never invokes a model, tool, database, real credential or sandbox. Production mode refuses to start. All state is in memory and disappears on restart.

Build packages with `pnpm ui:build` and `pnpm --filter @asi/gateway-fixture build`; run the fixture with `pnpm --filter @asi/gateway-fixture start`. It listens only on `127.0.0.1:4300`. The synthetic session is established through `/api/ui/v1/me`. Mutations require its synthetic cookie, CSRF token and the frontend origin `http://127.0.0.1:3000`. This is demo authentication, not production identity qualification.

Send ordinary text for a two-delta synthetic response. Send `/question` for clarification, `/approval` for an action proposal, `/expired` for an expired proposal, `/error` for a tool failure, `/unknown` for an unknown tool outcome, or `/budget` for budget exhaustion. Approve/reject using the separate decision endpoint; answering a question uses the answer endpoint. An accepted approval becomes queued and completes synthetically after 500 ms. Acceptance itself does not prove execution.

The event endpoint accepts `scenario=duplicate`, `gap`, `late-other-chat`, or `disconnected` for deterministic recovery drills. Default replay is immutable and ordered. Invalid cursors return 409. Catalogs explicitly report unavailable. Non-credential management commands return an approval-required result pointing to its owning conversation; real credentials are refused before persistence.

Uploads accept plain text up to 64 KiB. Bytes are discarded; upload/scanning/ready are simulated UI states, not malware scanning. Only ready synthetic attachment IDs can be submitted. Capacity is bounded. The fixture is unsuitable for storing any real private content.

Verification: `pnpm exec vitest run --project unit tests/ui/contracts/mock-gateway.test.ts` uses an actual ephemeral HTTP server and SSE transport. Regressions cover cancellation invalidation, old-run timer fencing, public client uploads, idempotency, version conflict, CSRF, unavailable catalogs and replay disruption scenarios.

Build order remains system 01–02 → U01–U03 → U04–U10, with backend 03–16 and 19 required before live integration U17–U19. The complete approved plans and both task ledgers remain authoritative. Seven primary sections own navigation; questions and approvals belong inside Chat. No separate approval, question or agent dashboard route is permitted.

For the connected demo browser, set `NEXT_PUBLIC_ASI_UI_MODE=demo` when building and starting the web app; keep the fixture running and open port 3000. Without that explicit mode the UI targets the live same-origin API and reports unavailable when it is absent. This is deliberate, with no synthetic fallback after a live error.
