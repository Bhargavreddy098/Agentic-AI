# Frontend for Stage 01–06 — Design

**Status:** approved direction, 2026-10-23
**Scope:** a Cursor-style, three-pane frontend over the canonical `/api/v1` surface.
**Backend:** unchanged. No route, DTO, migration, policy or configuration change.

---

## 1. Purpose

Give the locally qualified Stage 01–06 backend a real operator surface: browse what
exists, and perform governed actions against the exact canonical contracts. This is
an operator console for a control plane, not a marketing site and not an AI product.

Success means an owner can connect a local session, see every Stage 01–06 record,
and perform every Stage 01–06 mutation with the same authorization, idempotency and
precondition rules the backend enforces — with failures shown truthfully rather than
paraphrased.

## 2. Non-goals

- No backend change of any kind.
- No Stage 07+ capability. No runs, streams, memory, scheduling or deployment UI.
- No generated-content or AI surface in the new product shell.
- No invented endpoints, no mock success paths in the shipped surface.
- No destructive or high-impact action performed for the sake of test coverage.

## 3. Authority

Coverage, method, auth profile, CSRF, idempotency, `If-Match` requirements, success
status and response envelope are **derived at build time** from
`docs/backend/api/frontend-stage01-06.manifest.json`, which
`npm run api:frontend` generates from the canonical contract and registered route
source. The frontend never restates these facts by hand.

The manifest currently reports **50 implemented routes** across stages 1, 3, 4, 5 and
6 (2 / 5 / 19 / 17 / 7), of which **25 require CSRF** and **24 require an
idempotency key**; **4 PATCH routes require `If-Match`**:

- `PATCH /api/v1/projects/:projectId`
- `PATCH /api/v1/settings`
- `PATCH /api/v1/budgets/:budgetId`
- `PATCH /api/v1/providers/:providerId`

These numbers are observations of the manifest as generated on 2026-10-23, not
constants in code. When `npm run api:frontend` later adds Stage 07 routes, the shell
reports the new figures without redesign.

## 4. Structure

Three panes over an activity rail and a status bar.

```
┌────┬──────────────┬────────────────────────────┬──────────────┐
│    │              │  [ Overview ][ Console ]   │  CONTEXT     │
│ ●  │  ▾ Projects  │────────────────────────────│  Session     │
│ ●  │    asi-core  │                            │   owner ✓    │
│ ●  │    demo-repo │   detail view or the       │   exp 12m    │
│ ●  │  ▾ Stage 05  │   action console           │              │
│ ●  │    Policies  │                            │  Capabilities│
│ ●  │    Grants    │                            │  Budget ▓░42%│
│ ●  │  ▾ Stage 06  │                            │  Requests    │
│ ⌘K │    Providers │                            │              │
├────┴──────────────┴────────────────────────────┴──────────────┤
│ ● backend ready · 127.0.0.1:4400 · Stage 01–06 · 50/50 · ⌘K   │
└───────────────────────────────────────────────────────────────┘
```

- **Activity rail** — one icon per stage surface; command palette at the bottom.
- **Sidebar** — a tree scoped to the active surface. Projects expand to
  conversations and artifacts; stage 05 expands to policies, grants, approvals,
  budgets, settings, usage; stage 06 to providers and models.
- **Center** — tabbed. Selecting a record opens a tab; the Console is permanent.
- **Context panel** — session, capability flags, budget consumption, and the
  sanitized request log.
- **Status bar** — health, API origin, derived coverage, connection state.

Layout is responsive: below 1100px the context panel collapses into a toggle; below
720px the sidebar becomes an overlay sheet. The three-pane shape is preserved
wherever there is room for it.

## 5. Surfaces and route mapping

Every manifest route has an owning surface. A surface may own several routes.

| Surface | Stage | Routes owned |
| --- | --- | --- |
| Status bar / Health | 1 | `GET /health/live`, `GET /health/ready` |
| Connect | 3 | `POST /api/v1/session/bootstrap`, `GET /api/v1/session`, `DELETE /api/v1/session` |
| Workspaces | 3 | `GET /api/v1/workspaces` |
| Capabilities | 3 | `GET /api/v1/capabilities` |
| Projects | 4 | list, create, read, patch, archive; snapshots |
| Conversations | 4 | list, create, read; messages list and send |
| Artifacts | 4 | list, read, content stream, export |
| Uploads | 4 | create, content `PUT`, complete |
| Operations | 4 | `GET /api/v1/operations/:operationId` |
| Policies | 5 | current, create revision, activate |
| Grants | 5 | list, create, revoke |
| Approvals | 5 | request, list, read, decide, revoke |
| Budgets | 5 | list, create, patch |
| Settings | 5 | read, patch |
| Usage | 5 | `GET /api/v1/usage` |
| Providers | 6 | list, create, read, patch, discovery |
| Models | 6 | `GET /api/v1/models` |
| Routing | 6 | `POST /api/v1/routing/preview` |

Coverage is computed by matching every manifest route to an owning surface entry.
A route with no surface is a build-time failure, not a silent gap.

## 6. Action Console

A REPL in the center pane. One command maps to one canonical route.

```
> create project "asi-core" --kind greenfield
  POST /api/v1/projects                      201   42ms
  id 7f3a…c21   status ready

> approve 8b1d…4e2 --decision approve
  ✗ POST /api/v1/approvals/8b1d…/decisions   409    8ms
  APPROVAL_DIGEST_MISMATCH · approval is stale; re-read before retrying
```

Properties:

- The parser resolves a command to exactly one manifest route. Unknown commands and
  unknown flags are rejected locally with the available grammar, never sent.
- Every request renders method, path, status, latency, a truncated correlation id and
  the sanitized response. Failures render the backend's `code` and `title` verbatim.
- Mutations that require `If-Match` accept `--if-match <value>`; the console refuses
  to dispatch when the requirement is unmet (see §9).
- Uploads accept a local file path, stream the bytes, and show the digest the client
  computed alongside the one the backend reported.
- Commands are discoverable: `help`, and completion per surface.

The console is an alternative entry point to the same typed route functions the forms
call. It is not a second implementation and it holds no privileged path.

## 7. API client

```
lib/api/manifest.ts   imports the generated JSON manifest; exports route lookup,
                      requirement derivation, coverage counts
lib/api/client.ts     fetch wrapper, envelope unwrapping, problem+json → typed error,
                      CSRF, idempotency, If-Match, retry policy, sanitized logging
lib/api/routes.ts     50 typed functions, one per manifest route
lib/api/types.ts      DTO types mirroring the manifest's dtoDefinitions
```

**Envelope handling.** The manifest declares four shapes: unwrapped JSON,
`{data, meta}`, no body, and raw bytes. `client.ts` dispatches on the route's declared
`responseEnvelope` rather than guessing. `meta.requestId` is captured for correlation.

**Origin.** The client never sets an `Origin` request header. The browser supplies it
and the backend validates the real value. Requests use `credentials: "include"`. The
manifest's `authentication.origin` note — never infer arbitrary localhost ports — is
honoured by configuration, not by header manipulation.

**Errors.** `application/problem+json` is parsed into `{code, title, status, detail,
retryable, requestId}`. The UI shows `code` and `title`. It never shows stack traces,
SQL, raw provider payloads or sensitive paths, because the backend does not send them
and the client does not invent them.

## 8. Idempotency

One `Idempotency-Key` belongs to one **logical operation**, not to one HTTP attempt.

- A key is generated when a logical operation is created — a console command
  invocation, or a form submission.
- Retries of that same operation after a network error, timeout or retryable 5xx
  **reuse the same key**.
- A genuinely new operation gets a new key.
- `client.ts` owns this: callers pass a logical-operation handle, and the client
  attaches the stable key across its internal retry loop. Retries are bounded, and
  only for retryable classes (`retryable: true`, network failure, 429).
- The key is displayed in the request inspector for the owning operation only, never
  in a global log, a URL, a query string or an error message shown to third parties.
- Upload routes are recorded in the manifest as not requiring a key; they use the
  upload id plus expected digest instead, and the client follows the route's own
  declared mechanism rather than assuming one universal scheme.

An operation whose outcome is unknown is surfaced as unknown and reconciled by
re-reading, never silently retried as if nothing happened.

## 9. If-Match

`client.ts` reads `ifMatchRequired` from the manifest per route. When true and no
current version is available to the caller, dispatch is **refused locally** with a
clear message. The client does not send a guessed, empty or wildcard value, and does
not fall back to sending the request without the header.

Current versions are obtained by reading the record first. The UI keeps the value it
read alongside the form, and surfaces a conflict (`409`/`412`) as "the record changed
since you opened it — reload and re-apply", with the reload action inline.

## 10. Session

The approved launcher flow:

1. The owner runs `npm run session:challenge` from the repository root.
2. The owner opens the ACL-protected JSON the launcher wrote.
3. The owner pastes the 43-character challenge and client nonce into the Connect
   screen.
4. `POST /api/v1/session/bootstrap` sets the HttpOnly `asi_local_session` cookie.
5. The returned `csrfToken` and session metadata (`principalId`, `workspaceId`,
   `expiresAt`) are held **in memory only**.

Rules:

- No session secret is written to `localStorage`, `sessionStorage`, IndexedDB or a
  cookie the frontend controls. The browser's own cookie jar holds the session cookie;
  the frontend never reads it (it is HttpOnly).
- After a page refresh, state is recovered by calling `GET /api/v1/session`. Its
  `csrfToken` is re-derived server-side, so the console remains usable without a
  second bootstrap.
- Any `401` is treated as session loss: in-memory state is cleared and the user
  returns to Connect.
- Logout calls `DELETE /api/v1/session` with the CSRF token and an idempotency key,
  then clears in-memory state.
- Bootstrap challenges and nonces are never logged, never echoed back to the screen
  after submission, and are excluded from the request log.

## 11. Request log security

The context panel's request log is a sanitized projection, never a raw dump.

**Never displayed or stored:** session cookies, `Authorization` values, bootstrap
challenges and nonces, CSRF tokens, provider API keys, `secretReferenceId` values,
`DATABASE_URL` or any credential, and any header outside an explicit allowlist.

The allowlist covers method, path (with parameter values redacted to `:param`),
status, latency, request id, and a fixed set of safe headers (`content-type`,
`accept`). Response bodies are shown only for routes whose manifest `responseDto` is
declared non-secret, and only after the same redaction pass. Fields the manifest or
the client's type marks as sensitive are replaced with `•••`.

The log is in-memory and bounded; it is not persisted to disk.

## 12. Configuration

- New explicit frontend setting: `ASI_API_ORIGIN`, defaulting to
  `http://127.0.0.1:4400`, declared in `frontend/my-app/.env.example`.
- Next.js rewrites `/api/v1/*` and `/health/*` to `ASI_API_ORIGIN`. The rewrite does
  **not** read generic `PORT`, which Next.js uses for its own server.
- The backend's own configuration, `.env` and route behaviour are untouched.
- If `ASI_API_ORIGIN` is unset or unreachable, the shell starts in a clearly
  disconnected state and says so; it does not pretend to be connected.

## 13. Legacy surfaces

`components/chat.tsx`, `app/api/chat/route.ts` and the OpenUI library code stay on
disk, unchanged and importable. They are:

- not linked from the new navigation,
- not called by any new frontend code,
- not part of the new product surface, which talks only to canonical `/api/v1`.

`components/console.tsx` and `components/console.css` are replaced by the new shell.

## 14. Testing

Three layers, matching the request's correction 9.

**Contract tests (broad coverage).** For every manifest route, assert that the typed
route function exists, builds the manifest-declared method and path, attaches CSRF
exactly when `csrfRequired`, attaches an idempotency key exactly when
`idempotencyKeyRequired`, attaches `If-Match` exactly when `ifMatchRequired`, uses
`credentials: "include"`, sets no `Origin` header, and unwraps the declared
`responseEnvelope`. This proves shape for all 50 routes without performing 50
mutations.

**Component tests.** Render each surface against a stubbed transport and assert
rendering, the `If-Match` refusal path, the idempotency-key reuse across a retry, the
401 → Connect transition, and that the request log never contains a token, cookie or
secret.

**End-to-end (representative).** Against the real local PostgreSQL-backed backend:
connect a session, create a project, open a conversation, send a message, read the
message back, preview routing, and confirm a deliberate conflict renders the real
`code`. These are the workflows that prove the client speaks the real protocol.

Coverage is reported as `implemented / expected` derived from the manifest, and is
only claimed when the contract tests pass for that figure. No destructive or
high-impact action is performed to raise a counter.

**Commands:** `npm run typecheck`, `npm run lint`, `npm test` within
`frontend/my-app`, plus manual verification in the preview against the running
backend.

## 15. Failure and edge behaviour

| Condition | Behaviour |
| --- | --- |
| Backend down / origin unreachable | Disconnected shell state; retry affordance; no fake data |
| `401` anywhere | Clear session state, return to Connect |
| `403` | Show the denial with the capability that would be required |
| `409` / `412` on a PATCH | "Record changed" with inline reload; re-apply after reload |
| `429` | Show retry-after, reuse the same idempotency key on retry |
| `503` on `/health/ready` | Status bar reads unready with the failing dependency named |
| 202 operation | Show an operation id and poll `GET /operations/:id`; never report success at acceptance |
| Unknown outcome (network drop mid-mutation) | Mark uncertain; reconcile by reading; no blind retry |

Async acceptance is never rendered as completion. A `202` shows as in progress until
the operation reports a terminal state.

## 16. Accessibility

Keyboard-first: the command palette, tab switching, tree navigation and console
history are all reachable without a pointer. Visible focus rings on every interactive
element, `aria-current` on navigation, `role="status"` for async updates and
`role="alert"` for failures. Respects `prefers-reduced-motion` and
`prefers-color-scheme`, with dark as the default and a manual toggle.

## 17. File layout

```
app/(studio)/layout.tsx          shell composition
app/(studio)/page.tsx            overview
app/(studio)/connect/page.tsx    session gate
components/shell/                activity-rail, tree-sidebar, tab-bar, context-panel,
                                 status-bar, command-palette, responsive boundaries
components/stages/               one component per surface in §5
components/console/              parser, grammar, transcript, request inspector
lib/api/                         manifest, client, routes, types
lib/session/                     session context and recovery
```

`components/console.tsx` and `components/console.css` are removed. Nothing under
`backend/`, `packages/contracts/`, `scripts/` or `docs/backend/` is modified.

## 18. Definition of done

- All 50 manifest routes reachable from the shipped surface.
- Contract tests pass for all of them; component and end-to-end suites pass.
- Coverage figures derived from the manifest, not hardcoded.
- No session secret in browser storage; refresh recovers via `GET /api/v1/session`.
- No `Origin` header set by client code; `credentials: "include"` throughout.
- Idempotency reuse verified across an induced retry.
- `If-Match` derived from the manifest and refused when unavailable.
- Request log proven free of cookies, tokens, challenges and keys.
- Legacy chat files present, unmodified, unlinked and uncalled.
- `npm run typecheck`, `npm run lint` and the frontend test suite pass.
- Backend diff is empty.
