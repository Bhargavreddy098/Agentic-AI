# Local gateway and first-chat correction — 2026-10-24

Requested by the owner: replace manual browser bootstrap with a gateway and make the chat composer available. This is a Stage 03 native identity UX replacement and Stage 04 conversation UX correction; it does not implement Stage 08 or enable public execution.

## Result

`npm run gateway` loads the existing protected `.env.runtime`, verifies the local frontend/backend readiness, looks up exactly one active local owner and opens the workspace in the default browser. No credentials, challenges, nonces or gateway ticket are printed. Optional `--origin` selects an existing allowlisted HTTP loopback frontend, for example `npm run gateway -- --origin http://127.0.0.1:3000`.

The native launcher uses the existing IdentityPort to issue and consume a one-time challenge. A random 256-bit handoff ticket is delivered only to the launched browser through a temporary loopback URL; it is never offered by a public endpoint, stored in browser application storage, or written into frontend configuration. The listener requires the exact loopback Host, rejects cross-origin requests and unsupported methods, expires after 60 seconds, and consumes the ticket once. It sends the existing HttpOnly SameSite=Strict `/api/v1` cookie and redirects to the plain `/studio` URL with no-referrer/no-store headers. The launcher closes the listener after handoff. The ticket is a short-lived bearer credential; transient native process/browser URL handling is confined to this local launch, and the consumed ticket cannot be reused.

Arbitrary visits to `/studio` cannot issue owner credentials. Session expiry/revocation, hashed token storage, strict Origin checks, project scope and CSRF remain enforced. The canonical `/api/v1/session/bootstrap` contract remains available for trusted compatibility; its manual challenge/nonce page is removed. `/connect` redirects to `/studio`. This is not an unauthenticated “auto-owner” HTTP endpoint, a new SaaS identity system, or an Electron release.

The composer renders on an empty workspace and can hold an unsaved in-memory draft when disconnected. After gateway connection, confirming the first message creates a Personal project when none is selected, creates the conversation and persists the message through the existing approved APIs. Stable sub-command idempotency keys survive partial retries; a replay does not duplicate the project, conversation or message. The user sees the project-creation consequence before confirming. Existing project conversations, attachments, settings and Stage 07 Activity remain available. Session recovery on browser focus discovers the cookie established by the gateway in another tab.

There are no simulated assistant responses. Stages 01–07 provide durable message storage and execution foundations; later planning/execution/verification gates still govern AI runs. The composer states that AI replies are not yet enabled.

## Verification

- `npm test` from the repository root: **166 passed**, zero failed/skipped, including real PostgreSQL gateway tests for Host/Origin, method/ticket rejection, single-use concurrency, expiry, HttpOnly cookie scope, CSRF and revocation.
- `npm test` from `frontend/my-app`: **89 passed**, including first-message stable keys across an interrupted retry.
- `node --env-file-if-exists=.env.admin --test frontend/my-app/tests/live-workbench.integration.mjs`: **passed**, real PostgreSQL/HTTP frontend helper creates exactly one first conversation and message across replay.
- Root/frontend typecheck: **passed**. Root lint: **passed**. Frontend lint: no errors, five pre-existing unused-variable warnings.
- Frontend production webpack build: **passed**.
- `npm run gateway` against the user's actual local installation: **passed**; native browser handoff completed and the backend subsequently recorded authenticated 200 session, settings and project requests. No fixture project/message was seeded in the user's database.
- In-app browser: the initial screen exposes the editable message composer, contains no Connect owner link or challenge/nonce form, and truthfully identifies a separate browser profile without a gateway session.

Important files: `backend/src/platform/gateway/local-gateway.js`, `scripts/gateway.mjs`, `scripts/open-local-workspace.ps1`, frontend `studio/page.tsx`, `connect/page.tsx`, `SessionProvider.tsx`, and `lib/api/desktop-workspace.ts`. Existing unrelated changes were preserved. No migration, password rotation, dependency installation, commit or push was required.

## Operation

With the existing local frontend and backend running, use `npm run gateway` to open the authenticated workspace. Run it again after explicit sign-out or session expiry. It fails closed if the database, frontend/backend readiness, or owner provisioning is unavailable. A browser on another hostname/profile needs its own handoff. This launcher does not claim to supervise servers, package Electron, replace the provider gateway, or authorize later-stage execution.
