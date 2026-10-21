# OpenClaw frontend connected to supported ASI services

Status: design approved by the user on 2026-10-21 with “yes proceed,” in response to the specification review request. Implementation-plan review remains required by the active workflow; no runtime changes have been made.

## Requested outcome

Use the imported OpenClaw frontend with ASI's backend. Show only features backed by working ASI operations. Hide unsupported screens, controls and deep links. Keep the personal local Windows target without adding user RBAC. Do not implement missing backend product features merely to populate the UI.

Success means a runnable OpenClaw-derived frontend using ASI HTTP/SSE APIs, with server-controlled feature availability, no synthetic fallback and tests proving hidden features cannot be reached or executed through frontend routes/actions.

## Current source observations

- Imported OpenClaw revision: `844b03541a8bdbc01f1bbac3c218d1b579123a12`.
- `third_party/openclaw/ui/src/api/gateway.ts` implements a browser client around the OpenClaw Gateway protocol and operator scopes. It cannot talk directly to ASI's existing API.
- `third_party/openclaw/ui/src/app-routes.ts` statically registers many OpenClaw-only pages. Hiding sidebar entries alone would leave unsupported pages reachable.
- `third_party/openclaw/ui/src/app-navigation.ts` declares upstream navigation independently of ASI backend readiness.
- ASI `apps/gateway/src/ui/app.ts` implements versioned HTTP routes and SSE via injected ports.
- ASI `apps/gateway/src/ui-server.ts` composes `createProtectedUiPorts`, which starts from `createMemoryUiPorts`. This is not durable production conversation/model service composition.
- `apps/gateway/src/ui/memory-ports.ts` uses Maps, synthetic assertions and no catalog adapters (`catalogs: {}`). Its upload scan is an in-memory decision, not an actual file-scanning service.
- `packages/models/src/generate.ts` explicitly returns a mock result and fixed usage.
- `packages/sandbox/src/windows.ts` refuses executable effects because isolation is unqualified.
- `scripts/run-applet.mjs` explicitly starts a synthetic demo, not the requested connected frontend.

These observations are static source evidence, not fresh live qualification. Backend libraries and route declarations must not be treated as configured working services.

## Architecture decision

Create a separate application-owned OpenClaw frontend derivative under `apps/openclaw`, preserving the imported snapshot and its hash manifest. Reuse the upstream Solid UI, styles/assets and selected screen implementations. Follow its Solid ownership/lifecycle guidance when adapting those components. Preserve copyright and relevant notices in the derivative.

Adapt the frontend at its Gateway/data boundary to use ASI's existing HTTP/SSE contracts. Do not install or start OpenClaw's backend, add an ASI server pretending to be a complete OpenClaw Gateway, or reuse OpenClaw operator-role logic as ASI user RBAC. The adapter implements only the requests/events required by retained screens; unsupported methods have no compatibility stub.

Retain existing ASI service ownership for policy, credentials, privacy, budgets, approvals and execution. The browser receives safe projections, never provider credentials, database access, signing keys or execution authority. Route availability is a presentation decision; backend authorization still applies independently.

Keep current ASI and demo entry points available during integration. Introduce explicit connected frontend dev/build/start commands so a synthetic launcher cannot be mistaken for live integration.

## Capability discovery and availability

Add a runtime-validated, versioned capability projection to the ASI UI Gateway. Populate it from trusted service composition and actual owner readiness; do not infer readiness from existing filenames, ledger status, HTTP 200 responses or the fact that a port was injected.

Represent operation state explicitly as `live`, `synthetic`, `unconfigured` or `unavailable`. A live state requires a real configured adapter and the relevant readiness evidence. Synthetic ports cannot advertise live operations. If discovery is missing, malformed, unauthenticated or fails, the frontend shows only a connection/status shell and no product operations.

Capabilities describe operations, not roles: conversation read/create/update, message send, run cancel, clarification answer, approval decide, uploads, each catalog read/mutation, memory read/mutation, activity read and settings read/mutation. Read support does not imply mutation support. Maintain a schema version/revision and refresh availability on connection/session changes and explicit invalidation. Recheck before dispatching a mutation; the backend remains authoritative in races.

Do not fabricate local authentication using `assert-workspace-a` or grant an admin role to make the UI appear connected. Preserve origin/CSRF/session protections. The real local browser bootstrap must be identified and tested before protected screens are enabled; keep them unavailable if no valid bootstrap exists.

## Screen and operation mapping

| OpenClaw area | ASI backing | Visibility condition |
|---|---|---|
| Connection/status | ASI health plus validated capability discovery | Minimal shell remains available; health alone enables no feature. |
| Sessions/conversations | Conversation list/create/patch and snapshot routes | Show read UI only with live read support; independently gate create/rename/delete. Current memory-only composition is excluded. |
| Chat transcript | Conversation snapshot and ordered SSE events | Require live transcript ownership and event/replay support. |
| Chat composer | Message-send plus actual run/provider execution | Hidden with current mock generation; show only when the complete path is live. |
| Stop/run controls | Run cancel | Require live cancellation, an active run and server-advertised action support. |
| Clarifications/approvals | Typed answer/decision endpoints and backend-owned interactions | Only inside a supported conversation, using exact interaction/revision identity. No separate authority in frontend. |
| Providers/models | Safe provider/model catalogs and supported commands | Show ready live catalogs; do not enable configuration based on read support. |
| Skills | Skill catalog and supported lifecycle commands | Require the corresponding live read/mutation capabilities independently. |
| Tools/connections | Connection catalog and supported commands | Require live adapters; hide shell/terminal/execution paths while isolation is unavailable. |
| Memory | Memory query and supported revision commands | Require live broker projection and local project/private scope handling. |
| Activity/usage | Actual task/activity and measured run usage | Require live data; never synthesize token/cost totals. |
| Settings | Safe settings projection and individually supported commands | Hide unavailable backend settings; local appearance preferences may remain explicitly local. |
| Cron, workboards, portals, meetings, cloud workers, devices, plugins, terminal, other upstream pages | No verified corresponding live ASI UI service composition found in this review | Exclude from route registration, navigation, search/command menus and lazy loaders. Reassess only through a real adapter. |
| Attachments/artifact actions | Real upload/quarantine/storage/download services | Gate independently; synthetic scanning or a file reference alone is insufficient. |

An empty live catalog is supported and may show a truthful empty state. An absent/unavailable catalog is unsupported and hidden. A transient outage of a previously supported service shows a scoped failure state and blocks actions; it must not silently switch to demo data.

With the current default Gateway composition, the initial connected app may show only connection/status. That is the intended consequence of excluding synthetic services. This task does not expand into implementing providers, persistence, isolation or catalogs that are missing.

## Frontend adaptation boundaries

- Keep upstream source provenance immutable. Application-owned derivative files are enrolled in normal ASI lint/type/build/architecture checks, not covered by the reference-snapshot exclusions.
- Build a pruned entrypoint and route registry rather than booting the full upstream app and hiding controls with CSS.
- Map ASI conversation IDs, revisions, command IDs, event sequences, interactions and structured errors explicitly. Do not manufacture OpenClaw server facts or successful method responses.
- Preserve idempotency identities across uncertain retries. Snapshot/replay reconciliation must reject cross-conversation or stale-connection results.
- Unsupported direct URLs resolve to an appropriate safe route/not-found state without loading the unsupported page or fetching its backend methods.
- Capability revocation clears protected cached data, aborts subscriptions and prevents queued mutations from being sent.
- Retain the supplied light parchment design constraints in the application-owned presentation adaptation. Do not rebuild the existing React UI as a substitute for using OpenClaw components.
- Resolve the selected Solid/Vite package and shared-source closure explicitly. The imported manifest documents unresolved references; copying the upstream package manifest into the ASI workspace is not a valid installation plan.

## Validation required before calling this connected

1. Unit/contract tests for capability discovery: default synthetic ports excluded; absent owner excluded; live empty catalog visible; independent read/mutation gates; malformed/unknown states fail closed.
2. Adapter contracts against an actual ASI HTTP server for every enabled operation, plus SSE reconnect, duplicate/gap/stale events and cancellation where advertised.
3. Route tests for hidden navigation, direct URLs, menu/search shortcuts and suppressed lazy imports. Unsupported features produce zero backend requests.
4. Session/origin/CSRF tests: no development assertion shortcuts, credential leakage or client-selected escalation. Capability changes during pending requests are handled safely.
5. Browser test using the connected launch command and actual ASI server: verify the minimal default shell, then verify enabled feature behavior with a named real configured adapter. Synthetic fixtures may test presentation but cannot qualify live behavior.
6. Production build, strict types/lint, dependency inventory, architecture checks, appropriate accessibility/browser checks, and unchanged upstream import integrity. Preserve existing unrelated local edits and existing app entry points.

## Review boundary

This document is the proposed design for the requested integration. Implementation requires review of this specification, followed by a concrete implementation plan under the active brainstorming workflow. No new backend feature, no-RBAC overhaul, provider spend, deployment or replacement of existing data is included in this design approval.
