# Frontend Stage 01–06 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cursor-style three-pane operator console over the canonical `/api/v1` surface, covering every Stage 01–06 route with no backend change.

**Architecture:** A generated JSON manifest is the single source of truth for routes, requirements and envelopes. A thin typed client reads that manifest to attach CSRF, idempotency and `If-Match` exactly when declared, then unwraps whichever of the four declared response envelopes applies. Surfaces and a REPL both call the same typed route functions; neither holds a privileged path.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript strict, Vitest 3.2.7, `node:test` for manifest/contract suites.

**Spec:** `docs/superpowers/specs/2026-10-23-frontend-stages-01-06-design.md`

## Global Constraints

- The backend is not modified. `backend/`, `packages/contracts/`, `scripts/`, `docs/backend/` and root `package.json` keep their current contents. The final diff must show zero backend changes.
- All route facts — method, path, `csrfRequired`, `idempotencyKeyRequired`, `ifMatchRequired`, `successStatus`, `responseEnvelope` — are read from `docs/backend/api/frontend-stage01-06.manifest.json`. No hand-written route table, no hardcoded coverage integer.
- The client never sets an `Origin` request header. It uses `credentials: "include"`. The backend validates the real browser Origin.
- No `PORT`-based backend selection. The only backend-origin variable is `ASI_API_ORIGIN`, default `http://127.0.0.1:4400` (override-aware via `frontend/my-app/.env.example`).
- One `Idempotency-Key` per logical operation; reused across retries of that operation; new only for a new operation.
- No session secret in `localStorage`, `sessionStorage`, IndexedDB or any frontend-written cookie. Session state is in memory, recovered on refresh via `GET /api/v1/session`.
- Any `401` clears session state and returns to Connect.
- The request log never contains cookies, `Authorization`, CSRF tokens, bootstrap challenges/nonces, provider keys, `secretReferenceId` values or database credentials. Only method, redacted path, status, latency, request id and safe headers are shown.
- `components/chat.tsx`, `app/api/chat/route.ts` and the OpenUI library stay on disk unmodified, unlinked from navigation and uncalled by new code.
- Legacy and non-canonical routes are never called: no `/api/ui/v1`, no `/api/chat`.
- Dark is the default theme.
- `npm run typecheck` and `npm run lint` pass in `frontend/my-app`.

## Review Focus

- **A mutation retried after a network drop must not double-charge or double-create.** A reasonable person expects one logical action to produce one effect. Task 7 pins key reuse across an induced retry.
- **Refreshing the page mid-work must not silently sign the user out.** A reasonable person expects their session to survive a reload. Task 6 pins recovery via `GET /api/v1/session`.
- **A `202` must never look like a finished job.** A reasonable person expects a snapshot or export that is still running to say so. Task 10 pins pending-until-terminal operation rendering.
- **A PATCH must not fire without its precondition.** A reasonable person expects stale-write protection to hold, not to be skipped when the UI lacks a version. Task 8 pins local refusal.
- **A session expiring mid-action must not leave a stale "connected" shell.** A reasonable person expects to be returned to Connect. Task 6 pins the global 401 transition.
- **The request log is visible on screen and must not leak what it shows.** A reasonable person expects a debugging panel to be safe to show a colleague. Task 13 pins redaction.

---

## File Structure

**Created — manifest and client**
- `frontend/my-app/lib/api/manifest.ts` — loads the generated JSON, exposes route lookup, requirement derivation, coverage counts, surface ownership.
- `frontend/my-app/lib/api/types.ts` — `ApiRoute`, `ProblemDetails`, `ApiResult`, envelope types, derived DTO types.
- `frontend/my-app/lib/api/client.ts` — fetch wrapper: CSRF, idempotency, `If-Match`, retry, envelope unwrap, problem parsing, sanitized log records.
- `frontend/my-app/lib/api/routes.ts` — one typed function per manifest route.
- `frontend/my-app/lib/api/surfaces.ts` — the surface→route-ownership map used for coverage validation.

**Created — session**
- `frontend/my-app/lib/session/SessionProvider.tsx` — in-memory session context, bootstrap, recover, revoke, global 401 handling.

**Created — shell**
- `frontend/my-app/app/(studio)/layout.tsx`
- `frontend/my-app/components/shell/activity-rail.tsx`
- `frontend/my-app/components/shell/tree-sidebar.tsx`
- `frontend/my-app/components/shell/tab-bar.tsx`
- `frontend/my-app/components/shell/context-panel.tsx`
- `frontend/my-app/components/shell/status-bar.tsx`
- `frontend/my-app/components/shell/command-palette.tsx`
- `frontend/my-app/components/shell/request-log.tsx`

**Created — surfaces (one file each)**
- `frontend/my-app/components/stages/health-surface.tsx`
- `frontend/my-app/components/stages/session-surface.tsx`
- `frontend/my-app/components/stages/workspaces-surface.tsx`
- `frontend/my-app/components/stages/capabilities-surface.tsx`
- `frontend/my-app/components/stages/projects-surface.tsx`
- `frontend/my-app/components/stages/conversations-surface.tsx`
- `frontend/my-app/components/stages/artifacts-surface.tsx`
- `frontend/my-app/components/stages/uploads-surface.tsx`
- `frontend/my-app/components/stages/operations-surface.tsx`
- `frontend/my-app/components/stages/policies-surface.tsx`
- `frontend/my-app/components/stages/grants-surface.tsx`
- `frontend/my-app/components/stages/approvals-surface.tsx`
- `frontend/my-app/components/stages/budgets-surface.tsx`
- `frontend/my-app/components/stages/settings-surface.tsx`
- `frontend/my-app/components/stages/usage-surface.tsx`
- `frontend/my-app/components/stages/providers-surface.tsx`
- `frontend/my-app/components/stages/models-surface.tsx`
- `frontend/my-app/components/stages/routing-surface.tsx`

**Created — console**
- `frontend/my-app/components/console/grammar.ts` — command grammar and flag definitions.
- `frontend/my-app/components/console/parse.ts` — parser resolving a command to exactly one manifest route.
- `frontend/my-app/components/console/transcript.tsx`
- `frontend/my-app/components/console/console-pane.tsx`

**Created — routes and tests**
- `frontend/my-app/app/(studio)/page.tsx` — overview.
- `frontend/my-app/app/(studio)/connect/page.tsx` — session gate.
- `frontend/my-app/tests/manifest.test.mjs` — `node:test`, root manifest integrity.
- `frontend/my-app/tests/contract.test.mjs` — `node:test`, all 50 routes against a stubbed transport.
- `frontend/my-app/tests/surfaces.test.mjs` — `node:test`, coverage ownership validation.
- `frontend/my-app/tests/client.test.mjs` — `node:test`, idempotency, If-Match, envelope, redaction.
- `frontend/my-app/tests/logic.test.mjs` — `node:test`, parser and pure helpers.
- `frontend/my-app/tests/e2e/README.md` — the documented end-to-end procedure.

**Modified**
- `frontend/my-app/next.config.ts` — rewrites derive from `ASI_API_ORIGIN`.
- `frontend/my-app/package.json` — add `test` script only.
- `frontend/my-app/.env.example` — add `ASI_API_ORIGIN`.
- `frontend/my-app/app/globals.css` — add dark-default tokens.
- `frontend/my-app/app/layout.tsx` — keep fonts and providers; shell supplies its own chrome.

**Removed**
- `frontend/my-app/components/console.tsx`
- `frontend/my-app/components/console.css`
- `frontend/my-app/app/page.tsx` (superseded by `app/(studio)/page.tsx`; leaves the studio layout as the only root chrome)

**Note on test imports:** the `node:test` suites import `.ts` modules directly. Node 24 strips types natively, so no loader is added. If `node --test` rejects a `.ts` import on this machine, the fallback is to run the suites through the already-present `vitest` 3.2.7 at the repository root with `vitest run --dir frontend/my-app`; record which runner was used in the commit message. Do not add a new test framework.

**Untouched**
- `frontend/my-app/components/chat.tsx`, `app/api/chat/route.ts`, `lib/beui-library.tsx`, `lib/generated/**`, all `components/ui/**`.

---

### Task 1: Manifest access layer and derived facts

Turns the generated manifest into the typed facts every later task consumes.

**Files:**
- Create: `frontend/my-app/lib/api/types.ts`
- Create: `frontend/my-app/lib/api/manifest.ts`
- Test: `frontend/my-app/tests/manifest.test.mjs`
- Modify: `frontend/my-app/package.json` (add `test` script)

**Interfaces:**
- Produces:
  - `type ApiRoute = { stage: number; method: string; path: string; canonicalRoute: string; authProfile: string; csrfRequired: boolean; idempotencyKeyRequired: boolean; ifMatchRequired: boolean; successStatus: number; responseEnvelope: EnvelopeShape; implementationFile: string; limitations: string[] }`
  - `type EnvelopeShape = 'unwrapped' | 'enveloped' | 'none' | 'bytes'`
  - `MANIFEST_ROUTES: ApiRoute[]`
  - `routeKey(method: string, path: string): string`
  - `findRoute(method: string, path: string): ApiRoute | undefined`
  - `coverage(): { expected: number; implemented: number; byStage: Record<number, number>; csrf: number; idempotency: number; ifMatch: number }`
  - `ENVELOPE_SHAPES: Record<string, EnvelopeShape>`

- [ ] **Step 1: Write the failing test**

```js
// frontend/my-app/tests/manifest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST_ROUTES, coverage, findRoute, routeKey } from '../lib/api/manifest.ts';

test('manifest routes load with required fields', () => {
  assert.ok(MANIFEST_ROUTES.length > 0);
  for (const r of MANIFEST_ROUTES) {
    assert.equal(typeof r.method, 'string');
    assert.equal(typeof r.path, 'string');
    assert.ok(['unwrapped', 'enveloped', 'none', 'bytes'].includes(r.responseEnvelope), r.path);
  }
});

test('coverage is derived, not constant', () => {
  const c = coverage();
  assert.equal(c.expected, MANIFEST_ROUTES.length);
  assert.equal(c.implemented, MANIFEST_ROUTES.filter(r => r.implemented !== false).length);
  assert.deepEqual(Object.keys(c.byStage).map(Number).sort(), [1, 3, 4, 5, 6]);
});

test('if-match routes are discovered from the manifest', () => {
  const patch = MANIFEST_ROUTES.filter(r => r.ifMatchRequired);
  assert.ok(patch.length > 0);
  assert.ok(patch.every(r => r.method === 'PATCH'));
  for (const r of patch) assert.ok(findRoute('PATCH', r.path), r.path);
});

test('routeKey is stable', () => {
  const r = MANIFEST_ROUTES[0];
  assert.equal(routeKey(r.method, r.path), routeKey(r.method, r.path));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/manifest.test.mjs`
Expected: FAIL — cannot find module `../lib/api/manifest.ts`

- [ ] **Step 3: Implement the manifest layer**

`lib/api/types.ts` declares `ApiRoute`, `EnvelopeShape`, `ProblemDetails`, `ApiResult`, `RequestLogRecord` (fields: `id`, `method`, `pathTemplate`, `status`, `latencyMs`, `requestId`, `contentType`) — no body, no headers beyond `contentType`.

`lib/api/manifest.ts` imports the JSON with `resolveJsonModule`, maps manifest `responseEnvelope` strings to `EnvelopeShape` via an explicit lookup (`'Unwrapped JSON' → 'unwrapped'`, `'{data:responseDto,...}' → 'enveloped'`, `'No body' → 'none'`, `'Raw bytes' → 'bytes'`), and exports the functions in Interfaces.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/manifest.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/lib/api/types.ts frontend/my-app/lib/api/manifest.ts frontend/my-app/tests/manifest.test.mjs frontend/my-app/package.json
git commit -m "feat(frontend): derive route facts from generated API manifest"
```

---

### Task 2: Configuration and rewrites

Makes the backend origin explicit and keeps `PORT` out of backend selection.

**Files:**
- Modify: `frontend/my-app/next.config.ts`
- Modify: `frontend/my-app/.env.example`
- Test: `frontend/my-app/tests/logic.test.mjs`

**Interfaces:**
- Produces: `resolveApiOrigin(env: Record<string, string | undefined>): string` exported from `next.config.ts` for testing; defaults to `http://127.0.0.1:4400`.

- [ ] **Step 1: Write the failing test**

```js
// frontend/my-app/tests/logic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiOrigin } from '../next.config.ts';

test('explicit origin wins', () => {
  assert.equal(resolveApiOrigin({ ASI_API_ORIGIN: 'http://127.0.0.1:4400' }), 'http://127.0.0.1:4400');
});
test('defaults to 4400 when unset', () => {
  assert.equal(resolveApiOrigin({}), 'http://127.0.0.1:4400');
});
test('ignores generic PORT for backend selection', () => {
  assert.equal(resolveApiOrigin({ PORT: '3000' }), 'http://127.0.0.1:4400');
  assert.equal(resolveApiOrigin({ PORT: '3000', ASI_API_ORIGIN: 'http://127.0.0.1:4400' }), 'http://127.0.0.1:4400');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: FAIL — `resolveApiOrigin` not exported

- [ ] **Step 3: Implement**

Export `resolveApiOrigin` from `next.config.ts`; both rewrite destinations use `${origin}/api/v1/:path*` and `${origin}/health/:path*`. Add to `.env.example`:

```
# Backend origin for server-side rewrites. Not PORT — Next.js uses PORT for itself.
ASI_API_ORIGIN=http://127.0.0.1:4400
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/next.config.ts frontend/my-app/.env.example frontend/my-app/tests/logic.test.mjs
git commit -m "feat(frontend): derive backend rewrites from explicit ASI_API_ORIGIN"
```

---

### Task 3: Session state with refresh recovery and 401 handling

**Files:**
- Create: `frontend/my-app/lib/session/session-store.ts`
- Create: `frontend/my-app/lib/session/SessionProvider.tsx`
- Test: `frontend/my-app/tests/client.test.mjs`

**Interfaces:**
- Consumes: `findRoute` from Task 1.
- Produces:
  - `type SessionView = { principalId: string; workspaceId: string; expiresAt: string; csrfToken: string }`
  - `createSessionStore({ transport, storage? }): { get(): { session: SessionView | null; status: 'unknown' | 'connected' | 'disconnected' }; recover(): Promise<void>; bootstrap(challenge: string, clientNonce: string): Promise<void>; revoke(): Promise<void>; handleUnauthorized(): void }` — framework-free, lives in `session-store.ts`.
  - `SessionProvider({ children, transport? })`
  - `useSession()` — React binding over the store, same surface as `createSessionStore`'s return plus `session`/`status`.
  - `transport` is injectable for tests; defaults to global `fetch`. `storage` exists only so the test can prove it is never written to.

- [ ] **Step 1: Write the failing test**

```js
// frontend/my-app/tests/client.test.mjs  (session section)
test('refresh recovers session through GET /api/v1/session', async () => {
  const calls = [];
  const transport = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ data: { principalId: 'p', workspaceId: 'w', expiresAt: '2030-01-01T00:00:00.000Z', csrfToken: 't' } }) }; };
  const s = createSessionStore({ transport });
  await s.recover();
  assert.equal(calls[0], '/api/v1/session');
  assert.equal(s.get().status, 'connected');
});

test('401 clears session state', async () => {
  const s = createSessionStore({ transport: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await s.recover();
  assert.equal(s.get().status, 'disconnected');
  assert.equal(s.get().session, null);
});

test('session is never written to browser storage', async () => {
  const stored = [];
  const s = createSessionStore({ storage: { setItem: (...a) => stored.push(a) }, transport: async () => ({ ok: true, status: 200, json: async () => ({ data: { principalId: 'p', workspaceId: 'w', expiresAt: '2030-01-01T00:00:00.000Z', csrfToken: 't' } }) }) });
  await s.recover();
  assert.equal(stored.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: FAIL — `createSessionStore` not defined

- [ ] **Step 3: Implement**

`lib/session/session-store.ts` holds the framework-free `createSessionStore({ transport, storage? })` returning `{ get, recover, bootstrap, revoke, handleUnauthorized }`, storing state in a closure variable. `SessionProvider.tsx` wraps it in React context exposing `useSession`. Bootstrap posts `{challenge, clientNonce}` to `/api/v1/session/bootstrap`; revoke `DELETE`s `/api/v1/session`. No storage call is made anywhere.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: PASS, 3 session tests

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/lib/session frontend/my-app/tests/client.test.mjs
git commit -m "feat(frontend): in-memory session with refresh recovery and 401 reset"
```

---

### Task 4: Envelope unwrapping and problem parsing

**Files:**
- Create: `frontend/my-app/lib/api/envelope.ts`
- Create: `frontend/my-app/lib/api/problem.ts`
- Test: `frontend/my-app/tests/client.test.mjs`

**Interfaces:**
- Consumes: `EnvelopeShape` from Task 1.
- Produces:
  - `unwrapEnvelope(shape: EnvelopeShape, response: { json?: () => Promise<unknown>; arrayBuffer?: () => Promise<ArrayBuffer>; status: number }): Promise<{ data: unknown; meta?: { requestId?: string; version?: string; nextCursor?: string } }>` — in `envelope.ts`.
  - `parseProblem(status: number, body: unknown): ProblemDetails` returning `{ code, title, status, detail, retryable, requestId }` — in `problem.ts`.
  - `ProblemDetails` includes `retryable: boolean` sourced from the body when present, else `status >= 500 || status === 429`.

- [ ] **Step 1: Write the failing test**

```js
test('enveloped response surfaces data and meta', async () => {
  const r = await unwrapEnvelope('enveloped', { status: 200, json: async () => ({ data: [{ id: 1 }], meta: { requestId: 'r1', nextCursor: 'c2' } }) });
  assert.deepEqual(r.data, [{ id: 1 }]);
  assert.equal(r.meta.nextCursor, 'c2');
});

test('unwrapped response returns body as-is', async () => {
  const r = await unwrapEnvelope('unwrapped', { status: 200, json: async () => ({ ready: true }) });
  assert.deepEqual(r.data, { ready: true });
});

test('no-body response yields null', async () => {
  const r = await unwrapEnvelope('none', { status: 204 });
  assert.equal(r.data, null);
});

test('problem is parsed with code and retryability', () => {
  const p = parseProblem(409, { type: 'https://asi.local/problems/x', title: 'APPROVAL_DIGEST_MISMATCH', status: 409, code: 'APPROVAL_DIGEST_MISMATCH', detail: 'stale' });
  assert.equal(p.code, 'APPROVAL_DIGEST_MISMATCH');
  assert.equal(p.retryable, false);
  assert.equal(parseProblem(503, {}).retryable, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: FAIL — `unwrapEnvelope` not defined

- [ ] **Step 3: Implement**

`unwrapEnvelope` switches on `shape`; `'bytes'` returns an `ArrayBuffer` in `data`; `'none'` returns `null` without reading the body. `parseProblem` reads `code`/`title`/`detail`, never surfaces a raw body, and derives `retryable` per the rule above.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: PASS, all envelope tests

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/lib/api/envelope.ts frontend/my-app/tests/client.test.mjs
git commit -m "feat(frontend): unwrap declared envelopes and parse problem details"
```

---

### Task 5: Request requirements — CSRF, idempotency, If-Match

This is the task that enforces Design §8 and §9.

**Files:**
- Create: `frontend/my-app/lib/api/requirements.ts`
- Test: `frontend/my-app/tests/client.test.mjs`

**Interfaces:**
- Consumes: `ApiRoute` (Task 1).
- Produces:
  - `type Operation = { id: string; idempotencyKey: string | null }`
  - `beginOperation(route: ApiRoute): Operation` — generates a key only when `route.idempotencyKeyRequired`
  - `buildHeaders(route: ApiRoute, op: Operation, ctx: { csrfToken: string | null; ifMatch?: string }): { headers: Record<string,string>; refusal?: string }`
  - Refusal rules: CSRF missing on a `csrfRequired` route → refusal; `ifMatchRequired` and no `ifMatch` → refusal. Neither refusal mutates anything.

- [ ] **Step 1: Write the failing test**

```js
test('csrf attached exactly when declared', () => {
  const r = MANIFEST_ROUTES.find(x => x.csrfRequired);
  const { headers } = buildHeaders(r, beginOperation(r), { csrfToken: 'tok' });
  assert.equal(headers['X-CSRF-Token'], 'tok');
  const g = MANIFEST_ROUTES.find(x => !x.csrfRequired);
  assert.equal(buildHeaders(g, beginOperation(g), { csrfToken: 'tok' }).headers['X-CSRF-Token'], undefined);
});

test('no Origin header is ever set', () => {
  for (const r of MANIFEST_ROUTES) {
    const { headers } = buildHeaders(r, beginOperation(r), { csrfToken: 't', ifMatch: 'v' });
    assert.equal(Object.keys(headers).some(h => h.toLowerCase() === 'origin'), false, r.path);
  }
});

test('If-Match refusal when the manifest requires it and none supplied', () => {
  const r = MANIFEST_ROUTES.find(x => x.ifMatchRequired);
  const res = buildHeaders(r, beginOperation(r), { csrfToken: 't' });
  assert.ok(res.refusal);
  assert.equal(res.headers['If-Match'], undefined);
});

test('If-Match sent when supplied', () => {
  const r = MANIFEST_ROUTES.find(x => x.ifMatchRequired);
  assert.equal(buildHeaders(r, beginOperation(r), { csrfToken: 't', ifMatch: 'v1' }).headers['If-Match'], 'v1');
});

test('idempotency key only where required', () => {
  const yes = MANIFEST_ROUTES.find(x => x.idempotencyKeyRequired);
  const no = MANIFEST_ROUTES.find(x => !x.idempotencyKeyRequired);
  assert.ok(beginOperation(yes).idempotencyKey);
  assert.equal(beginOperation(no).idempotencyKey, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: FAIL — `buildHeaders` not defined

- [ ] **Step 3: Implement**

`requirements.ts` reads only `route.csrfRequired`, `route.idempotencyKeyRequired`, `route.ifMatchRequired`. Header keys use the exact casing `X-CSRF-Token`, `Idempotency-Key`, `If-Match`, `Content-Type`. It never writes `Origin`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/lib/api/requirements.ts frontend/my-app/tests/client.test.mjs
git commit -m "feat(frontend): derive CSRF, idempotency and If-Match from manifest"
```

---

### Task 6: Transport with bounded retry and stable idempotency

**Files:**
- Modify: `frontend/my-app/lib/api/client.ts` (create)
- Test: `frontend/my-app/tests/client.test.mjs`

**Interfaces:**
- Consumes: Tasks 3, 4, 5.
- Produces:
  - `createClient({ transport, getCsrfToken, onUnauthorized, onLog, maxRetries = 2 }): { request<T>(route: ApiRoute, opts: { path?: string; body?: unknown; query?: Record<string,string>; ifMatch?: string; operation?: Operation; signal?: AbortSignal }): Promise<ApiResult<T>> }`
  - `ApiResult<T> = { ok: true; data: T; status: number; meta?: object } | { ok: false; problem: ProblemDetails }`
  - Retry only when `problem.retryable` or the transport throws a network error, and only while `route` is retryable; the same `Operation` (and its key) is reused for every attempt.

- [ ] **Step 1: Write the failing test**

```js
test('a retried logical operation reuses one idempotency key', async () => {
  const seen = [];
  let attempt = 0;
  const transport = async (url, init) => {
    seen.push(init.headers['Idempotency-Key']);
    attempt++;
    if (attempt === 1) throw new TypeError('network');
    return { ok: true, status: 201, json: async () => ({ data: { id: 'x' } }) };
  };
  const client = createClient({ transport, getCsrfToken: () => 't', onUnauthorized() {}, onLog() {} });
  const route = MANIFEST_ROUTES.find(r => r.idempotencyKeyRequired && r.method === 'POST');
  const res = await client.request(route, { body: {} });
  assert.equal(res.ok, true);
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
});

test('a new operation gets a new key', async () => {
  const keys = [];
  const transport = async (u, init) => { keys.push(init.headers['Idempotency-Key']); return { ok: true, status: 201, json: async () => ({ data: {} }) }; };
  const client = createClient({ transport, getCsrfToken: () => 't', onUnauthorized() {}, onLog() {} });
  const route = MANIFEST_ROUTES.find(r => r.idempotencyKeyRequired && r.method === 'POST');
  await client.request(route, { body: {} });
  await client.request(route, { body: {} });
  assert.notEqual(keys[0], keys[1]);
});

test('401 triggers onUnauthorized', async () => {
  let called = false;
  const client = createClient({ transport: async () => ({ ok: false, status: 401, json: async () => ({}) }), getCsrfToken: () => 't', onUnauthorized: () => { called = true; }, onLog() {} });
  await client.request(MANIFEST_ROUTES.find(r => r.method === 'GET'), {});
  assert.equal(called, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: FAIL — `createClient` not defined

- [ ] **Step 3: Implement**

`request` builds the URL from `route.canonicalRoute` (substituting `:param` segments from `opts.path` map), calls `buildHeaders`, refuses locally on `refusal`, then loops up to `1 + maxRetries` attempts. It uses `fetch` with `credentials: 'include'` and never sets `Origin`. On success it unwraps by `route.responseEnvelope`, emits a sanitized `RequestLogRecord`, and returns. On failure it parses the problem, calls `onUnauthorized` for 401, and retries only when permitted, reusing `operation`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/lib/api/client.ts frontend/my-app/tests/client.test.mjs
git commit -m "feat(frontend): transport with stable idempotency and bounded retry"
```

---

### Task 7: Sanitized request log

**Files:**
- Create: `frontend/my-app/lib/api/log.ts`
- Test: `frontend/my-app/tests/client.test.mjs`

**Interfaces:**
- Produces:
  - `type LogInput = { method: string; path: string; status: number; latencyMs: number; requestId?: string; contentType?: string }`
  - `redactPath(path: string): string` — replaces concrete id segments with `:param`
  - `makeRecord(input: LogInput): RequestLogRecord` — allowlist only; drops any unknown key
  - `SENSITIVE_KEYS: readonly string[]` — `['cookie','set-cookie','authorization','x-csrf-token','idempotency-key','challenge','clientNonce','csrfToken','secretReferenceId','apiKey','DATABASE_URL','password']`

- [ ] **Step 1: Write the failing test**

```js
test('request log drops sensitive fields', () => {
  const rec = makeRecord({ method: 'POST', path: '/api/v1/approvals/8b1d/decisions', status: 200, latencyMs: 3, requestId: 'r', contentType: 'application/json', cookie: 'asi_local_session=abc', authorization: 'Bearer x', csrfToken: 'tok', challenge: 'c'.repeat(43), apiKey: 'sk-live' });
  const text = JSON.stringify(rec);
  for (const leak of ['asi_local_session', 'Bearer', 'tok', 'c'.repeat(43), 'sk-live']) assert.equal(text.includes(leak), false, leak);
});

test('paths are redacted to templates', () => {
  assert.equal(redactPath('/api/v1/approvals/8b1d3f2a-1111-2222-3333-444455556666/decisions'), '/api/v1/approvals/:param/decisions');
});

test('all sensitive keys are listed for the audit', () => {
  assert.ok(SENSITIVE_KEYS.includes('x-csrf-token'));
  assert.ok(SENSITIVE_KEYS.includes('idempotency-key'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: FAIL — `makeRecord` not defined

- [ ] **Step 3: Implement**

`makeRecord` constructs a fresh object from the allowlisted fields only — it does not spread `input`. `redactPath` replaces 8+ character alphanumeric/`-` segments with `:param`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/client.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/lib/api/log.ts frontend/my-app/tests/client.test.mjs
git commit -m "feat(frontend): sanitized allowlist request log"
```

---

### Task 8: Surface ownership map and coverage validation

Guarantees every manifest route has an owning surface — the mechanism behind Design §5.

**Files:**
- Create: `frontend/my-app/lib/api/surfaces.ts`
- Test: `frontend/my-app/tests/surfaces.test.mjs`

**Interfaces:**
- Produces:
  - `type SurfaceId = 'health' | 'session' | 'workspaces' | 'capabilities' | 'projects' | 'conversations' | 'artifacts' | 'uploads' | 'operations' | 'policies' | 'grants' | 'approvals' | 'budgets' | 'settings' | 'usage' | 'providers' | 'models' | 'routing'`
  - `SURFACES: { id: SurfaceId; stage: number; label: string; owns: string[] }[]` where `owns` entries are `routeKey` values
  - `validateCoverage(): { missing: ApiRoute[]; duplicated: string[]; byStage: Record<number, number> }`

- [ ] **Step 1: Write the failing test**

```js
test('every manifest route has exactly one owning surface', () => {
  const v = validateCoverage();
  assert.deepEqual(v.missing, [], 'routes with no surface: ' + v.missing.map(r => r.method + ' ' + r.path).join(', '));
  assert.deepEqual(v.duplicated, []);
});

test('coverage counts match the manifest', () => {
  const v = validateCoverage();
  const total = MANIFEST_ROUTES.length;
  const owned = SURFACES.reduce((n, s) => n + s.owns.length, 0);
  assert.equal(owned, total);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/surfaces.test.mjs`
Expected: FAIL — `SURFACES` not defined

- [ ] **Step 3: Implement**

`surfaces.ts` lists the 18 surfaces from Design §5, each with the `routeKey` values it owns. Deduplicate with a `Set` and report any route neither owned nor uniquely owned.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/surfaces.test.mjs`
Expected: PASS, both tests, `missing` empty

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/lib/api/surfaces.ts frontend/my-app/tests/surfaces.test.mjs
git commit -m "feat(frontend): surface ownership map with coverage validation"
```

---

### Task 9: Typed route functions for all 50 routes

**Files:**
- Create: `frontend/my-app/lib/api/routes.ts`
- Test: `frontend/my-app/tests/contract.test.mjs`

**Interfaces:**
- Consumes: `ApiRoute`, `createClient`.
- Produces: `ROUTE_FUNCTIONS: Record<string, (client, args) => Promise<ApiResult<unknown>>>` keyed by `routeKey`, plus named exports per route. Each function passes only its declared path params, body and query; it does not choose headers.
  - Note: `routeKey` is `path`, not `canonicalRoute`. The two health routes have `path` values `/health/live` and `/health/ready` (no `/api/v1` prefix), while the rest are prefixed. Do not assume the prefix uniformly.

- [ ] **Step 1: Write the failing test**

```js
import { ROUTE_FUNCTIONS } from '../lib/api/routes.ts';
test('every manifest route has a typed function', () => {
  for (const r of MANIFEST_ROUTES) {
    const k = routeKey(r.method, r.path);
    assert.equal(typeof ROUTE_FUNCTIONS[k], 'function', 'missing ' + k);
  }
});
test('no function exists for a route outside the manifest', () => {
  for (const k of Object.keys(ROUTE_FUNCTIONS)) {
    const [method, path] = k.split(' ');
    assert.ok(findRoute(method, path), 'orphan ' + k);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/contract.test.mjs`
Expected: FAIL — `ROUTE_FUNCTIONS` not defined

- [ ] **Step 3: Implement**

One thin function per manifest route, each delegating to `client.request(findRoute(...)!, args)`. No route logic, no header logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/contract.test.mjs`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/lib/api/routes.ts frontend/my-app/tests/contract.test.mjs
git commit -m "feat(frontend): typed route functions for every canonical route"
```

---

### Task 10: Console grammar and parser

**Files:**
- Create: `frontend/my-app/components/console/grammar.ts`
- Create: `frontend/my-app/components/console/parse.ts`
- Test: `frontend/my-app/tests/logic.test.mjs`

**Interfaces:**
- Produces:
  - `parseCommand(input: string): { ok: true; command: string; route: ApiRoute; positional: string[]; flags: Record<string,string> } | { ok: false; error: string; suggestions?: string[] }`
  - `COMMANDS: { name: string; routeKey: string; positional: number; flags: string[] }[]`
  - Unknown commands and unknown flags return `ok: false` and never produce a route.

- [ ] **Step 1: Write the failing test**

```js
import { parseCommand } from '../components/console/parse.ts';

test('parses a known command to exactly one route', () => {
  const r = parseCommand('create project "asi-core" --kind greenfield');
  assert.equal(r.ok, true);
  assert.equal(r.route.method, 'POST');
  assert.equal(r.route.path, '/projects');
});

test('unknown command is rejected locally', () => {
  const r = parseCommand('frobnicate the widget');
  assert.equal(r.ok, false);
  assert.ok(r.error.length > 0);
  assert.equal(r.route, undefined);
});

test('unknown flag is rejected locally', () => {
  assert.equal(parseCommand('create project "x" --nope 1').ok, false);
});

test('--if-match is captured for PATCH commands', () => {
  const r = parseCommand('patch project 7f3a --if-match v1');
  assert.equal(r.ok, true);
  assert.equal(r.route.method, 'PATCH');
  assert.equal(r.route.path, '/projects/:projectId');
  assert.equal(r.flags['if-match'], 'v1');
});

test('quoted values survive spaces', () => {
  const r = parseCommand('create conversation 7f3a --title "My first chat"');
  assert.equal(r.ok, true);
  assert.equal(r.route.path, '/projects/:projectId/conversations');
  assert.equal(r.flags.title, 'My first chat');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: FAIL — `parseCommand` not defined

- [ ] **Step 3: Implement**

`grammar.ts` declares each command with its `routeKey`, positional arity and allowed flags. `parse.ts` tokenizes with quote awareness, resolves exactly one route via `findRoute`, rejects unknown flags, and carries no state.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/components/console frontend/my-app/tests/logic.test.mjs
git commit -m "feat(frontend): command grammar resolving to canonical routes"
```

---

### Task 11: Shell chrome — rail, sidebar, tabs, status bar

**Files:**
- Create: `frontend/my-app/app/(studio)/layout.tsx`
- Create: `frontend/my-app/components/shell/activity-rail.tsx`
- Create: `frontend/my-app/components/shell/tree-sidebar.tsx`
- Create: `frontend/my-app/components/shell/tab-bar.tsx`
- Create: `frontend/my-app/components/shell/status-bar.tsx`
- Modify: `frontend/my-app/app/globals.css`

**Interfaces:**
- Consumes: `SURFACES`, `coverage`, `useSession`.
- Produces: `StudioLayout` chrome; `useTabs()` returning `{ open(surface: SurfaceId, id?: string): void; active: Tab; close(id: string): void }`.

- [ ] **Step 1: Write the failing test**

```js
test('status bar renders derived coverage, not a constant', () => {
  const s = formatCoverage({ implemented: 50, expected: 50, byStage: { 1: 2, 3: 5, 4: 19, 5: 17, 6: 7 } });
  assert.match(s, /Stage 01–06/);
  assert.match(s, /50\s*\/\s*50/);
});

test('coverage text follows the manifest when routes are added', () => {
  const s = formatCoverage({ implemented: 53, expected: 53, byStage: { 1: 2, 3: 5, 4: 19, 5: 17, 6: 7, 7: 3 } });
  assert.match(s, /53\s*\/\s*53/);
});

test('stage range is derived from the stage map, not hardcoded', () => {
  assert.match(formatCoverage({ implemented: 2, expected: 2, byStage: { 7: 2 } }), /Stage 07/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: FAIL — `formatCoverage` not defined

- [ ] **Step 3: Implement**

`status-bar.tsx` exports a pure `formatCoverage(c)` used by both the component and the test. It computes the stage label from the keys of `byStage` (two-digit padded, `min`–`max`), and the ratio from `implemented`/`expected`, so Stage 07 routes later change the text with no code edit. Chrome is CSS grid: rail 48px, sidebar 260px, center flexible, context 300px; collapses per Design §4. Add dark-default tokens to `globals.css` via `.dark` on `<html>` and `prefers-color-scheme`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/app/\(studio\) frontend/my-app/components/shell frontend/my-app/app/globals.css
git commit -m "feat(frontend): Cursor-style shell chrome with derived coverage"
```

---

### Task 12: Overview, Connect gate, and session surface

**Files:**
- Create: `frontend/my-app/app/(studio)/page.tsx`
- Create: `frontend/my-app/app/(studio)/connect/page.tsx`
- Create: `frontend/my-app/components/stages/session-surface.tsx`
- Create: `frontend/my-app/components/stages/health-surface.tsx`
- Create: `frontend/my-app/components/stages/workspaces-surface.tsx`
- Create: `frontend/my-app/components/stages/capabilities-surface.tsx`
- Create: `frontend/my-app/lib/session/guard.ts`
- Test: `frontend/my-app/tests/logic.test.mjs`

**Interfaces:**
- Consumes: `useSession`, typed route functions.
- Produces: `guard(state: { status: 'unknown' | 'connected' | 'disconnected' }, path: string): { redirect?: string }` in `lib/session/guard.ts`. When `status !== 'connected'` and `path !== '/connect'`, returns `{ redirect: '/connect' }`.

- [ ] **Step 1: Write the failing test**

```js
test('unauthenticated studio access redirects to connect', async () => {
  const r = guard({ status: 'disconnected' }, '/projects');
  assert.equal(r.redirect, '/connect');
});
test('connected access passes through', () => {
  assert.equal(guard({ status: 'connected' }, '/projects').redirect, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: FAIL — `guard` not defined

- [ ] **Step 3: Implement**

`guard` is a pure function in `lib/session/guard.ts`. Connect renders the challenge/nonce form with the `npm run session:challenge` instruction, masks both inputs, clears them on submit, and never echoes them. Health shows live/ready with the failing dependency named on 503.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/app/\(studio\) frontend/my-app/lib/session frontend/my-app/components/stages
git commit -m "feat(frontend): connect gate, overview and stage 01/03 surfaces"
```

---

### Task 13: Projects, conversations, artifacts, uploads, operations

The largest surface group; includes the `202` pending rule.

**Files:**
- Create: `frontend/my-app/components/stages/projects-surface.tsx`
- Create: `frontend/my-app/components/stages/conversations-surface.tsx`
- Create: `frontend/my-app/components/stages/artifacts-surface.tsx`
- Create: `frontend/my-app/components/stages/uploads-surface.tsx`
- Create: `frontend/my-app/components/stages/operations-surface.tsx`
- Create: `frontend/my-app/lib/operations/poll.ts`

**Interfaces:**
- Produces: `operationState(status: string): 'pending' | 'succeeded' | 'failed' | 'unknown'`; `pollOperation(client, id, opts)` bounded, with cancellation.

- [ ] **Step 1: Write the failing test**

```js
test('a 202 is pending, never success', () => {
  assert.equal(operationState('queued'), 'pending');
  assert.equal(operationState('running'), 'pending');
  assert.equal(operationState('succeeded'), 'succeeded');
  assert.equal(operationState('failed'), 'failed');
});
test('unknown status is unknown, not success', () => {
  assert.equal(operationState('weird'), 'unknown');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: FAIL — `operationState` not defined

- [ ] **Step 3: Implement**

Projects surface: list with cursor pagination, create, read, patch (form carries the version it read), archive, snapshot. Conversations: list, create, open, messages list/send with 1–32000 char guard and ≤10 attachments. Artifacts: list, metadata, content stream, export with `destinationRef`. Uploads: create → PUT content with computed digest → complete. Operations: poll and render terminal state; never render success before terminal.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/components/stages frontend/my-app/lib/operations
git commit -m "feat(frontend): stage 04 surfaces with pending-until-terminal operations"
```

---

### Task 14: Governance surfaces — policies, grants, approvals, budgets, settings, usage

**Files:**
- Create: `frontend/my-app/components/stages/policies-surface.tsx`
- Create: `frontend/my-app/components/stages/grants-surface.tsx`
- Create: `frontend/my-app/components/stages/approvals-surface.tsx`
- Create: `frontend/my-app/components/stages/budgets-surface.tsx`
- Create: `frontend/my-app/components/stages/settings-surface.tsx`
- Create: `frontend/my-app/components/stages/usage-surface.tsx`
- Create: `frontend/my-app/lib/format/governance.ts`
- Test: `frontend/my-app/tests/logic.test.mjs`

**Interfaces:**
- Consumes: typed routes; `Operation` from Task 5.
- Produces: `canDecide(a: { approvalId: string; digest?: string; nonce?: string }): boolean` and `canPatch(a: { limitMicroUsd?: number; ifMatch?: string }): boolean` in `lib/format/governance.ts`.

- [ ] **Step 1: Write the failing test**

```js
test('approval decisions require an explicit digest from a fresh read', () => {
  assert.equal(canDecide({ approvalId: 'a' }), false);
  assert.equal(canDecide({ approvalId: 'a', digest: 'd', nonce: 'n' }), true);
});
test('budget patch requires a version', () => {
  assert.equal(canPatch({ limitMicroUsd: 5 }), false);
  assert.equal(canPatch({ limitMicroUsd: 5, ifMatch: 'v1' }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: FAIL — `canDecide` not defined

- [ ] **Step 3: Implement**

Policies: current, create revision from a base revision, activate by digest. Grants: list, create with `capability`/`resourceScope`/`expiresAt`, revoke with reason. Approvals: list filtered by `projectId`/`state`, read with scope/diff/cost, decide with nonce+digest, revoke. Budgets: list showing reservations, create, patch with `If-Match`. Settings: read, patch privacy/retention/defaultAutonomy/limits with `If-Match`, surface 409 conflict. Usage: paginated with `projectId`/`runId`/`from`/`to`/`category` filters.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/components/stages
git commit -m "feat(frontend): stage 05 governance surfaces"
```

---

### Task 15: Provider surfaces — providers, models, routing

**Files:**
- Create: `frontend/my-app/components/stages/providers-surface.tsx`
- Create: `frontend/my-app/components/stages/models-surface.tsx`
- Create: `frontend/my-app/components/stages/routing-surface.tsx`
- Create: `frontend/my-app/lib/format/provider.ts`
- Test: `frontend/my-app/tests/logic.test.mjs`

**Interfaces:**
- Consumes: typed routes.
- Produces: `renderProvider(p: Record<string, unknown>): string` and `discoveryMode(args: { probe: boolean }): 'discover' | 'probe'` in `lib/format/provider.ts`, both pure and redacting `secretReferenceId`.

- [ ] **Step 1: Write the failing test**

```js
test('provider secrets are never rendered', () => {
  const html = renderProvider({ providerId: 'p', displayName: 'Compat', secretReferenceId: 'sec-123', enabled: true });
  assert.equal(html.includes('sec-123'), false);
});
test('discovery without probe shows discovered models', () => {
  assert.equal(discoveryMode({ probe: false }), 'discover');
  assert.equal(discoveryMode({ probe: true }), 'probe');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: FAIL — `renderProvider` not defined

- [ ] **Step 3: Implement**

Providers: list with health, create with `kind`/`endpointPolicy`/`privacyPolicy`, patch with `If-Match`, discovery showing probe vs discover. Models: filter by `providerId`/`capability`. Routing: preview form posting task type, capabilities, token estimates, classification and budget ceiling; renders the chosen model and cost. `secretReferenceId` is redacted everywhere.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/components/stages
git commit -m "feat(frontend): stage 06 provider, model and routing surfaces"
```

---

### Task 16: Console pane, context panel, request inspector

**Files:**
- Create: `frontend/my-app/components/console/console-pane.tsx`
- Create: `frontend/my-app/components/console/transcript.tsx`
- Create: `frontend/my-app/components/shell/context-panel.tsx`
- Create: `frontend/my-app/components/shell/request-log.tsx`
- Create: `frontend/my-app/components/shell/command-palette.tsx`
- Create: `frontend/my-app/lib/console/render.ts`
- Test: `frontend/my-app/tests/logic.test.mjs`

**Interfaces:**
- Consumes: `parseCommand`, `createClient`, `makeRecord`, `useSession`.
- Produces: `renderTranscript(entries): string` and `renderInspector(record: RequestLogRecord): string` in `lib/console/render.ts`, pure and used by the components; both emit text only from allowlisted fields.

- [ ] **Step 1: Write the failing test**

```js
test('console transcript renders the real problem code, not a paraphrase', () => {
  const html = renderTranscript([{ kind: 'response', status: 409, problem: { code: 'APPROVAL_DIGEST_MISMATCH', title: 'APPROVAL_DIGEST_MISMATCH' } }]);
  assert.match(html, /APPROVAL_DIGEST_MISMATCH/);
});
test('inspector never renders a key or token', () => {
  const html = renderInspector(makeRecord({ method: 'POST', path: '/api/v1/projects', status: 201, latencyMs: 4 }));
  assert.equal(/csrf|token|cookie|secret/i.test(html), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: FAIL — `renderTranscript` not defined

- [ ] **Step 3: Implement**

Console keeps an operation per entered command so retries reuse the key; history with ↑/↓; `help` lists grammar. Context panel shows session, capabilities and budget meters. Request log renders `makeRecord` output only. Palette opens surfaces and common commands.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/logic.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/my-app/components/console frontend/my-app/components/shell
git commit -m "feat(frontend): action console, context panel and request inspector"
```

---

### Task 17: Remove the legacy console and verify nothing dangles

**Files:**
- Delete: `frontend/my-app/components/console.tsx`
- Delete: `frontend/my-app/components/console.css`
- Modify: `frontend/my-app/app/page.tsx` (remove, superseded by `(studio)/page.tsx`)
- Test: `frontend/my-app/tests/manifest.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('legacy chat is present but unreferenced by the new surface', async () => {
  const fs = await import('node:fs/promises');
  await fs.access('components/chat.tsx');
  await fs.access('app/api/chat/route.ts');
  const newFiles = ['app/(studio)/layout.tsx', 'components/shell/activity-rail.tsx', 'components/console/console-pane.tsx'];
  for (const f of newFiles) {
    const src = await fs.readFile(f, 'utf8');
    assert.equal(src.includes('api/chat'), false, f);
    assert.equal(src.includes('components/chat'), false, f);
  }
});
test('legacy console is gone', async () => {
  const fs = await import('node:fs/promises');
  await assert.rejects(fs.access('components/console.tsx'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/my-app && node --test tests/manifest.test.mjs`
Expected: FAIL — legacy console still present

- [ ] **Step 3: Remove**

Delete the two files, drop the old root `app/page.tsx` in favour of the studio route group, and confirm no import of `components/console` remains.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/my-app && node --test tests/manifest.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A frontend/my-app/components/console.tsx frontend/my-app/components/console.css frontend/my-app/app/page.tsx frontend/my-app/tests/manifest.test.mjs
git commit -m "refactor(frontend): replace legacy console, keep chat code unreferenced"
```

---

### Task 18: End-to-end verification against the real backend

**Files:**
- Create: `frontend/my-app/tests/e2e/README.md`

- [ ] **Step 1: Document the procedure**

Record exact commands: start PostgreSQL and the backend with `ASI_API_ORIGIN=http://127.0.0.1:4400`, run `npm run session:challenge`, start Next, then the scripted walk: connect → create project → create conversation → send message → read message back → `routing/preview` → induce a `409` on a PATCH by editing the record in another tab and confirm `Records changed` renders with the real code.

- [ ] **Step 2: Run the walk**

Run the procedure. Record each observed status against the expected one.

- [ ] **Step 3: Record outcomes**

In `tests/e2e/README.md`, record date, the backend commit, each step's result, and anything that could not be verified. An unrun step is marked `UNVERIFIED` — not passed.

- [ ] **Step 4: Commit**

```bash
git add frontend/my-app/tests/e2e/README.md
git commit -m "docs(frontend): record end-to-end verification against local backend"
```

---

### Task 19: Full checks and backend-diff proof

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend/my-app && node --test tests/*.test.mjs`
Expected: PASS, all suites

- [ ] **Step 2: Typecheck**

Run: `cd frontend/my-app && npm run typecheck`
Expected: exit 0

- [ ] **Step 3: Lint**

Run: `cd frontend/my-app && npm run lint`
Expected: exit 0

- [ ] **Step 4: Prove the backend is untouched**

Run: `git status --porcelain backend/ packages/ scripts/ docs/backend/ package.json`
Expected: no output attributable to this work. Any output must be pre-existing changes from before this task; state that explicitly rather than reverting them.

- [ ] **Step 5: Build**

Run: `cd frontend/my-app && npm run build`
Expected: successful production build

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "chore(frontend): full checks pass; backend diff empty"
```
