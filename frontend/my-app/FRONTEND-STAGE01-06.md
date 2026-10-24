# Stage 01–06 frontend — 2026-10-23

## Implemented scope

The workspace follows the existing canonical `docs/backend/05-API-CONTRACTS.md` and generated 50-route manifest. It adds no backend endpoints and changes no database schema. ChatGPT-style navigation means a labeled, searchable sidebar, active-section highlighting, distinct page titles and content, browser back/forward navigation, and a phone drawer.

Every canonical surface has a page. Stage 02 has a truthful database/readiness explanation rather than an invented database administration API. Session bootstrap/current/revocation use the existing session store and Connect page. Health uses the canonical health endpoints. The remaining surface-owned commands generate labeled action forms through the same request-body builder and API client already used by the console.

Project selection is explicit. Missing scopes are refused before dispatch; switching projects remounts the scoped page and clears its pagination and selection. Lists support refresh and cursor navigation. Selecting a record supplies its actual ID and version to read/update forms. Structured policy/provider fields use JSON editors with contract help; simple fields use text, choice and message controls. Mutations show the exact target and redacted body for review before dispatch. PATCH retains explicit If-Match, and retries retain one logical operation's idempotency key. Responses show backend status, version and request ID when present. Conflicts require reloading. Network write failures warn about uncertain outcomes.

File workflows use real selected bytes, bounded at 16 MiB, with SHA-256 staging/finalization. Downloads use the authorized byte route. Native export requires a trusted destination reference; snapshots require a registered root. Neither form accepts a host path. A 202 response is labeled accepted and directs the owner to read Operations; it never reports completion merely from acceptance.

Legacy links redirect into the corresponding workspace section. The former duplicate root-page component was retained under `components/shell/legacy-overview.tsx` so the root route has one owner.

## Setup

Configure `ASI_API_ORIGIN` in the ignored `frontend/my-app/.env.local` to match the running backend. This machine's configured backend listens on `http://127.0.0.1:4400`; the frontend previously pointed to an inactive port 3100. Only the frontend setting was corrected. Backend configuration and credentials were preserved.

From this frontend directory: `npm run dev -- --port 3000`. Production check: `npm run build -- --webpack`, then `npm start -- --hostname localhost --port 3000`. Owner connection uses the existing root `npm run session:challenge` workflow. Never paste database passwords into the frontend or chat. Challenges are masked, held in memory, and cleared after successful connection. No frontend fixture or fake session is mounted.

## Verification

- `npm test` from this directory: **82 passed**, including all-route action ownership, absent-project refusal, scope-specific pagination, exact decimal budget values, CAS refusal, stable retry identity, attachment IDs, raw upload bytes and recursive secret redaction.
- `npm run typecheck`: **PASS**.
- `npm run lint`: **PASS**, with five pre-existing unused-symbol warnings in retained health/rail code and tests; no errors or rule suppression added.
- `npm run build -- --webpack`: **PASS**. Cleared only obsolete generated development types after removing the duplicate root route.
- From repository root: `node --env-file-if-exists=.env.admin --test frontend/my-app/tests/live-workbench.integration.mjs`: **PASS**, against a randomly named disposable PostgreSQL database and the actual composed API. Proves form-generated project create/read/update, stale-version refusal, persisted conversations/messages, settings CAS, project budgets, provider/model/capability reads, and unknown-project denial. The fixture closes its server/pools and removes only its generated database and roles. No paid provider calls.
- Browser check: all **20 sidebar entries** opened the matching H1/page. Owner-disconnected states render explicit connection actions. Browser health reaches the real ready backend through the corrected proxy.
- Visual inspection: 1440px, 768px, 390px; **0 FAIL**. Warnings concern a global body palette token covered by the full-screen charcoal workspace and the intentional empty-record notice; neither introduces a placeholder record.

The authenticated browser challenge was not consumed during manual navigation checks. Authenticated form request execution was verified through the shared form-packet/client boundary against real PostgreSQL as described above. No destructive or security-changing production actions were performed to inflate coverage. This is local frontend qualification, not a production release or a claim that every possible provider/native-export environment is available. Existing official OpenAI live-positive qualification remains unresolved. No Stage 07+ functionality is exposed.

## Current desktop UX — 2026-10-24

The route-oriented studio has been reorganized into a project/conversation workspace. Settings and context panes retain all existing Stage 01–06 actions. See `docs/frontend/02-DESKTOP-WORKSPACE-EVIDENCE.md` for current implementation and verification. Stage 07 remains backend-unimplemented; the Activity pane reports that limit. This frontend is not an Electron installer.
