# OpenClaw–ASI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Recommended execution: native sequential in this chat, preserving unrelated local changes.

**Goal:** Run an OpenClaw-derived frontend against ASI HTTP/SSE, showing only operations backed by configured live ASI services.

**Architecture:** An application-owned Solid derivative lives in `apps/openclaw`; the upstream snapshot remains immutable. A server-owned capability projection controls route registration and individual actions. A typed ASI HTTP/SSE adapter replaces OpenClaw's WebSocket client; no OpenClaw backend or user RBAC is introduced.

**Tech Stack:** Existing Node 24.19.0, pnpm 12.6.0, TypeScript 5.9.3, Hono and Zod; selected upstream Solid 2/Vite packages, qualified before installation; existing Vitest and Playwright infrastructure.

**Spec:** [Approved integration specification](../specs/2026-10-21-openclaw-asi-integration.md).

**Review state:** Awaiting implementation-plan review. This document is not evidence that integration has been implemented or tested.

## Global Constraints

- “Show only features backed by working ASI operations. Hide unsupported screens, controls and deep links.”
- “Keep the personal local Windows target without adding user RBAC.”
- “Do not implement missing backend product features merely to populate the UI.”
- “Keep upstream source provenance immutable.” Pin `844b03541a8bdbc01f1bbac3c218d1b579123a12` and retain licenses/digests.
- “Application-owned derivative files are enrolled in normal ASI lint/type/build/architecture checks.”
- “The browser receives safe projections, never provider credentials, database access, signing keys or execution authority.”
- “Keep current ASI and demo entry points available during integration.”
- No provider calls, production migration, deployment or new execution capability is required or authorized by this plan.

## Review Focus

1. Healthy HTTP server with synthetic owners: show connection status without enabling Chat or catalogs (Tasks 1–2, 6).
2. Catalog is live but empty, or read-only: show a truthful read view without inventing configuration support (Tasks 3, 5).
3. Session/capability changes while an operation is pending: discard late data, clear private caches and stop queued mutations (Tasks 3–4).
4. User opens an unsupported upstream URL or shortcut directly: no lazy import, private page content or backend request (Tasks 4–6).
5. Partial SSE chunks, replay duplicates/gaps and uncertain mutation responses: retain ordering and command identity without duplicate execution (Task 3).

## Current release boundary

The default `ui-server.ts` composes memory-backed protected ports, not a durable live conversation/model stack. Its catalogs are absent; model generation is mocked and executable isolation is unavailable. The connected frontend must initially support the real health/status view while hiding those product features. Existing backend libraries do not automatically become browser services.

The adapter will cover existing API contracts so genuine configured owners can be connected without another transport rewrite. Tests using injected synthetic owners prove adapter and visibility behavior only. They must never be reported as qualification of a live provider, durable transcript or executable tool.

## File and ownership map

| Location | Responsibility |
|---|---|
| `packages/contracts/src/ui/capabilities.ts` | Additive versioned capability projection and operation IDs. |
| `apps/gateway/src/ui/capabilities.ts` | Trusted composition/readiness projection; no SQL or credentials in output. |
| `apps/gateway/src/ui/app.ts`, `ports.ts`, `index.ts`, `apps/gateway/src/ui-server.ts` | Discovery wiring and truthful current composition state. |
| `apps/openclaw/src/api/{capabilities,http,events,client}.ts` | Capability validation, same-origin transport, SSE and typed domain operations. |
| `apps/openclaw/src/state/connection.ts`, `routes.ts` | Connection generation, cache invalidation and route/action selection. |
| `apps/openclaw/src/{main,app}.tsx`, `pages/*.tsx`, `components/`, `styles/` | Pruned OpenClaw presentation and selected view derivatives. |
| `apps/openclaw/{package.json,tsconfig.json,index.html,vite.config.ts,UPSTREAM.json,LICENSE}` | Isolated runnable package, exact provenance and build configuration. |
| `scripts/run-openclaw.mjs`, `playwright.openclaw.config.ts` | Explicit connected launch/stop and browser qualification. |
| `tests/openclaw/*`, `tests/integration/openclaw-capabilities.test.ts` | Discovery, adapter, route, lifecycle, security and browser tests. |

No copied source in `third_party/openclaw` is modified. No existing unrelated edit, including `scripts/apply-migrations.mjs`, is staged or committed by this work.

## Task 1: Define operation-level capabilities and truthful composition

**Files:** Create `packages/contracts/src/ui/capabilities.ts`, `apps/gateway/src/ui/capabilities.ts`, `tests/openclaw/capabilities.test.ts`; modify `packages/contracts/src/ui/index.ts`, `apps/gateway/src/ui/ports.ts`, `apps/gateway/src/ui/index.ts`.

**Interfaces:**
- `UiOperationSchema`: exact enum `conversation.read`, `conversation.create`, `conversation.update`, `message.send`, `run.cancel`, `clarification.answer`, `approval.decide`, `upload.create`, `artifact.read`, `provider.read`, `provider.write`, `model.read`, `model.write`, `skill.read`, `skill.write`, `connection.read`, `connection.write`, `memory.read`, `memory.write`, `activity.read`, `usage.read`, `settings.read`, `settings.write`.
- `UiCapabilityStateSchema`: `live | synthetic | unconfigured | unavailable`.
- `UiCapabilitiesSchema`: strict `{schemaVersion:1, revision:number, operations:Array<{operation:UiOperation,state:UiCapabilityState}>}`; nonnegative safe revision, unique operation IDs, bounded array of at most 23; omitted operations deny.
- Internal `UiCapabilityBinding`: `{operation, adapterId, source:'live'|'synthetic', qualificationRef?:string, readiness:()=>Promise<boolean>}`; qualification references are trusted-owner records, not request values or client-provided declarations.
- `createUiCapabilityProvider(bindings: readonly UiCapabilityBinding[]): {read():Promise<UiCapabilities>}`. Synthetic remains synthetic regardless of readiness; missing qualification or binding cannot become live; readiness errors become unavailable. Revisions advance on state changes.

- [ ] Write tests named `synthetic readiness never becomes live`, `healthy server with no owners enables zero operations`, `missing qualification denies live state`, `readiness failure removes support`, `duplicate and unknown operation identities reject`, and `revision advances only on a changed projection`. Assert exact states and enabled-operation counts.
- [ ] Run `pnpm exec vitest run --project unit tests/openclaw/capabilities.test.ts`; observe missing-export failures before implementation.
- [ ] Implement schemas/factory in the files above. Export inferred types through existing contracts exports. Keep evidence/adapter identities internal and redact exception details.
- [ ] Rerun focused tests and `pnpm typecheck`; all existing contract fixtures remain valid because this is an additive endpoint/schema.
- [ ] Review and commit only the named files after GREEN; do not promote current synthetic owners to live or update old task completion labels.

## Task 2: Expose discovery through the existing ASI server

**Files:** Modify `apps/gateway/src/ui/app.ts`, `apps/gateway/src/ui-server.ts`; create `tests/integration/openclaw-capabilities.test.ts`.

**Interfaces:** Add optional `UiGatewayConfig.capabilities?: {read():Promise<UiCapabilities>}`. Register authenticated `GET /api/ui/v1/capabilities` after existing session middleware, with `Cache-Control: no-store`. An omitted provider returns a valid all-unconfigured projection. Existing `/health` remains a liveness endpoint and grants no product support.

- [ ] Write real ephemeral-HTTP tests: unauthenticated discovery is 401; unknown assertions cannot bootstrap; valid existing test-session setup returns schema-valid discovery; missing provider yields zero live operations; default protected composition cannot advertise Chat/upload/catalog support; owner failure exposes no internal error/credential text. These test assertions are synthetic test setup, never frontend authentication code.
- [ ] Run `pnpm exec vitest run --project integration tests/integration/openclaw-capabilities.test.ts` and observe failures for the missing endpoint.
- [ ] Wire discovery into `createUiGateway`. In `createUiGatewayServer`, declare current memory-backed operations synthetic and missing services unconfigured. Do not add a production bootstrap shortcut, new user login flow or a live-service claim.
- [ ] Rerun HTTP tests and existing `tests/ui/contracts/real-gateway.test.ts` in its configured unit project. Confirm demo/live markers and existing session/origin/CSRF checks remain intact.
- [ ] Review and commit only this task's changes.

## Task 3: Implement the typed ASI transport and replay boundary

**Files:** Create `apps/openclaw/src/api/capabilities.ts`, `http.ts`, `events.ts`, `client.ts`; create `tests/openclaw/{transport,events}.test.ts`.

**Interfaces:**
- `createAsiClient(options:{fetch:typeof fetch}):AsiClient`, using relative same-origin paths only, `credentials:'include'`, no client-supplied backend origin or bearer secrets.
- `AsiClient.health(signal?:AbortSignal):Promise<{status:'ok'}>` validates liveness without interpreting it as capability support.
- `AsiClient.capabilities(signal?:AbortSignal):Promise<UiCapabilities>` parses the new schema. 401/malformed/unknown version returns a typed transport failure; callers clear capabilities.
- `AsiClient.session(signal?):Promise<WorkspaceSession>` reads `/me` and retains CSRF only in connection memory. It never sends `assert-workspace-a` or stores credentials in localStorage.
- Typed methods mirror the existing `GatewayClient` domain signatures in `apps/web/src/lib/gateway/client.ts` using shared schemas; implement them in this package rather than importing another app. Include conversations/snapshot, existing catalog reads, memory/activity/settings, message/cancel/interaction/upload/command operations. Only operations with an existing endpoint are mapped; `artifact.read` and `usage.read` stay unsupported unless a genuine existing projection satisfies the exact requested action.
- `readAsiEvents(response:Response, signal:AbortSignal):AsyncGenerator<UiEvent>` parses bounded SSE frames including split UTF-8/newlines, validates event envelopes and rejects malformed frames.
- Mutation inputs retain caller-owned `commandId` across uncertain responses. Before mutation, refresh session/capabilities and require both live operation support and the existing server-allowed action. No fabricated acknowledgements or automatic new command ID.

- [ ] Write adapter tests against an ephemeral ASI HTTP server, covering exact route/body/schema mappings and credentials/CSRF headers; test denied operations generate zero product requests. Reuse existing safe contract fixtures rather than invent an OpenClaw protocol envelope.
- [ ] Add replay tests named `split UTF8 does not corrupt message`, `duplicate event does not advance twice`, `gap requests authoritative snapshot`, `old conversation cannot publish`, `abort cancels reader`, and `uncertain retry preserves commandId` with exact sequence/ID assertions.
- [ ] Run `pnpm exec vitest run --project unit tests/openclaw/transport.test.ts tests/openclaw/events.test.ts`; observe missing-module failures, then implement the adapter and replay state.
- [ ] Run the focused tests, `pnpm typecheck` and architecture checks. Transport has no OpenClaw Gateway dependency and no import from `apps/web`.
- [ ] Review and commit the isolated transport task.

## Task 4: Establish the pruned Solid package and capability-owned routing

**Files:** Create `apps/openclaw/package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `src/main.tsx`, `src/app.tsx`, `src/routes.ts`, `src/state/connection.ts`, `LICENSE`, `UPSTREAM.json`; create `tests/openclaw/{routes,connection}.test.ts`; modify root `package.json`, `tsconfig.json`, `vitest.config.ts`, `docs/architecture-baseline.json`, `docs/dependency-inventory.json`, `pnpm-lock.yaml`, and add `docs/decisions/UI-0005-openclaw-asi-integration.md` for this approved boundary.

**Interfaces:**
- Package name `@asi/openclaw`, scripts `dev`, `build`, `typecheck`; browser entry uses Solid, not React. Root TypeScript excludes its JSX graph in favor of the package's explicit strict typecheck; root verify must include that check, never silently omit it.
- Select upstream pins `solid-js@2.0.0-rc.14`, `@solidjs/web@2.0.0-rc.14`, `@solidjs/signals@2.0.0-rc.14`, `@solidjs/compiler@2.0.0-rc.14`, `@solidjs/vite-plugin@3.0.0-next.49`, `vite@8.3.4`, with existing TypeScript/Zod. Qualify package availability, peer/engine ranges and package-build behavior at execution before recording them installed/qualified. Do not substitute versions silently or import the whole upstream manifest.
- `visibleRoutes(capabilities:UiCapabilities):readonly ConnectedRoute[]`; `resolveConnectedRoute(path:string, capabilities:UiCapabilities):ConnectedRoute`; `canUseOperation(capabilities, operation):boolean`. `ConnectedRoute` IDs: `connection`, `sessions`, `chat`, `models`, `skills`, `connections`, `memory`, `activity`, `settings`.
- Connection route is always available. Sessions requires `conversation.read`; Chat transcript requires read plus event support verified by the configured owner. Composer requires `message.send` independently. Catalog routes require their read operation. Mutations remain individually gated. Unknown upstream pages never enter the route table.
- `createConnectionStore(client:AsiClient)` owns state `{generation,status,capabilities,session}` and methods `refresh`, `disconnect`, `dispose`. Changing connection/session identity increments generation, aborts current work and clears protected data. Failed capability refresh clears actionable support; a scoped transient failure view preserves truthful error context.

- [ ] Read upstream Solid instructions and required references before writing any Solid code. Retrieve missing skill/reference material from the pinned upstream revision; do not apply React lifecycle assumptions to Solid 2.
- [ ] Write route/lifecycle tests proving all Review Focus cases for direct paths, shortcuts, capability revocation, stale refresh and no product fetches during discovery failure. Tests assert unsupported import functions are never invoked, not merely hidden DOM.
- [ ] Qualify the selected dependency closure, record the new package under the existing `channels` component, and install only exact selected packages. Frozen installation must succeed afterward. If package qualification fails, report the concrete blocker without weakening inventory or substituting another frontend.
- [ ] Implement the pruned package/router/store. Do not mount upstream `main.ts` or import its full app context, route registry or Gateway client. Keep normal ASI checks active for this derivative.
- [ ] Run focused route/store tests, `pnpm --filter @asi/openclaw typecheck`, `pnpm --filter @asi/openclaw build`, dependency/architecture checks and frozen install verification. Browser/component compilation uses the qualified Solid plugin; no root React JSX transform is applied to Solid files.
- [ ] Review and commit only this task's named build/boundary changes. No blanket commit of pre-existing snapshot/scanner edits.

## Task 5: Adapt OpenClaw presentation and only supported views

**Files:** Create `apps/openclaw/src/pages/{connection,sessions,chat,models,skills,connections,memory,activity,settings}.tsx`, `src/components/`, `src/styles/{upstream,asi-theme}.css`, `tests/openclaw/presentation.test.tsx`; update `UPSTREAM.json`.

**Source selection:** Derive connection/status from upstream `ui/src/pages/connection/view.tsx` and its settings sections; derive session, chat and catalog views from the corresponding `ui/src/pages/` implementations. Reuse selected `components/solid/settings-ui.tsx`, `hub-page-header.tsx`, `loading-state.tsx`, `lazy-view-error.tsx` and icon data as needed. Replace OpenClaw context/RPC/roles with task 3's typed client and task 4's store. Copy only their resolved local dependencies; record original paths, source digests and intentional adaptations. Do not copy peer screen imports or desktop/plugin/terminal runtimes as implicit dependencies.

**Interfaces:** Each page receives `{client:AsiClient, connection:ConnectionStore, signal:AbortSignal}`; it owns display state only. All actions use typed adapter methods and visibility checks; views do not authorize effects. Route loaders import only the selected page and abort/clear when its capability disappears.

- [ ] Write Solid presentation tests: connection-only default has no New Chat/composer/model setup; live empty read catalog shows empty state; read-only model catalog has no edit/key form; stale page results cannot repopulate revoked data; approval controls require a matching backend interaction and preserve revision. Test synthetic data is visibly test-only and never accepted as live source evidence.
- [ ] Run `pnpm --filter @asi/openclaw exec vitest run --config vitest.config.ts` with this package's qualified Solid test config; observe missing page/component behavior before implementation.
- [ ] Adapt selected upstream views and component dependencies. Add `apps/openclaw/vitest.config.ts` for the Solid component project and ensure root verification invokes it. Keep unimplemented upstream screens absent from loaders, menus and keyboard commands.
- [ ] Adapt upstream layout/style selectors with local parchment tokens: `#faf8f5`, `#fdfbfa`, `#27251e`, `#72706b`, `#d1d1cd`, active fill `#016a71`, weights 400–500 and main content capped at 900px. Preserve accessible focus/keyboard behavior and responsive layout. Use no imagery or additional accent color.
- [ ] Run Solid component tests, strict types/build and source-provenance verification. Check the rendered default on desktop/mobile; correct visual regressions before handoff.
- [ ] Review and commit selected derivative files only.

## Task 6: Launch the connected UI and verify against ASI

**Files:** Create `scripts/run-openclaw.mjs`, `scripts/run-openclaw.test.mjs`, `playwright.openclaw.config.ts`, `tests/openclaw/browser/connected.spec.ts`, `docs/openclaw-connected-guide.md`; modify root `package.json`, `README.md`.

**Interfaces:** `pnpm openclaw:dev`, `pnpm openclaw:build`, `pnpm openclaw:start`, `pnpm openclaw:test`, `pnpm openclaw:test:e2e`. UI loopback port 3200; ASI UI Gateway port 4400. Vite dev proxy forwards only `/health` and `/api/ui/v1` to the fixed local ASI Gateway; no arbitrary destination or cookie forwarding outside this allowlist. Production preview serves the built frontend with the same bounded proxy. Do not expose OpenClaw's backend or a generic open proxy.

- [ ] Write launcher tests for occupied ports, missing build/config, startup failure, startup deadline and cleanup of only owned children. Test successful HTTP forwarding and refusal of unlisted paths/destinations.
- [ ] Add browser tests against the actual existing ASI server: `/health` reaches that server, unauthenticated discovery leaves connection-only UI, default synthetic owners never expose product routes, unsupported direct URLs trigger zero unsupported product requests, keyboard/mobile layout works and no upstream WebSocket is opened.
- [ ] Implement launcher/startup and bounded proxy with graceful shutdown; preserve existing `pnpm dev/start` behavior. Document that lack of a genuine local session/bootstrap prevents protected features rather than making the frontend send fixture assertions.
- [ ] Run launcher tests, then `pnpm openclaw:build` and `pnpm openclaw:test:e2e`. Capture browser evidence at 1440px and 390px and run applicable axe checks.
- [ ] If a genuine configured adapter exists at execution, test its full enabled workflow and name the actual owner in release evidence. If none exists, explicitly record “connection/status live; product workflows hidden; no enabled product workflow qualified.” Do not create a synthetic adapter to replace this acceptance.
- [ ] Review and commit launcher/docs/browser evidence only.

## Task 7: Final integration review and truthful handoff

**Files:** Create `docs/release-evidence/openclaw-integration.md`; update the new integration ADR, provenance and README as necessary.

- [ ] Run `pnpm lint`, `pnpm typecheck`, the Solid package typecheck/build/component checks, `pnpm ui:typecheck`, the focused Gateway/adapter/browser tests, architecture/dependency/traceability checks and `node third_party/openclaw/verify-import.cjs`. Confirm supported route actions use ASI only and no snapshot files changed.
- [ ] Run existing architecture scanner regression tests and affected existing Gateway UI contract tests. Compare pre-existing failures before claiming regressions fixed. Do not suppress tests or extend timeouts to manufacture success.
- [ ] Run `git diff --check` and inspect the final diff for secrets, hidden unsupported loaders, bypassed capability checks, altered execution authority, broad dependency promotion and unrelated changes.
- [ ] Review spec coverage: every capability and view maps to a task; unknown/missing/revoked support fails closed; all five Review Focus cases have named tests. Resolve findings before claiming completion.
- [ ] Report exact startup commands, actual visible features, hidden features, named checks and remaining backend limitations. Say explicitly whether only the real connection/status path is available. Do not label the product agent loop complete.

## Implementation-plan self-review

- Coverage: contracts/composition (1–2), ASI transport/replay (3), route/state/build ownership (4), upstream view reuse and styling (5), launch/live browser evidence (6), regression/handoff (7).
- Stable interfaces: task 1 schemas feed task 2 discovery and task 3 client; task 3 client feeds task 4 store and task 5 views. No task expects OpenClaw WebSocket handshakes or role claims.
- Preserve scope: no missing backend product is built, no synthetic operation is upgraded to live, no permanent administrator identity is introduced.
- Execution recommendation: native sequential, because capability contracts, transport, state ownership and page rendering depend on each other. Review this plan before implementation under the active skill workflow.
