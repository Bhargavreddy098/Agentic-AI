# ASI studio

Cursor-style local control plane for the verified Stage 01–06 backend. Start with the owner session, then use project records and canonical API commands.

## Stage 01–06 integration completion — 2026-10-23

All 50 canonical method/route pairs have command mappings and typed API functions. This is route reachability, not a claim that every route was exercised in a live browser or that later product stages exist. `help` now lists every command and its flags. The Cursor-style shell is retained.

Completed behavior:

- Real browser file selection, bounded at 16 MiB before reading. Upload computes SHA-256 from selected bytes, creates a staged upload, PUTs unchanged bytes, and completes by digest. Quarantined/blocked operation responses are displayed as such. No fake file paths, synthesized zero bytes, or host filesystem access.
- Filters and limit/cursor flags reach the server. Project-scoped lists and project selection have paging, refresh, error/loading states, stale-response cancellation, and refresh after successful mutations. Reserved artifact kind/runId filters remain rejected.
- If-Match accepts a positive decimal version, plain or quoted, and emits quoted wire syntax. Budget/usage amounts remain decimal strings; provider/grant nested fields are JSON objects.
- Session recovery, connect, disconnect and expiry/revocation notifications use subscriptions instead of polling. Logout sends CSRF plus Idempotency-Key and preserves the local session if the server cannot confirm revocation. Connect clears one-time inputs on success, and console challenge commands are redacted in the local transcript.
- The API client forwards raw bytes, scoped IDs, query strings, stable retry keys and Problem responses. Unresolved path placeholders are refused. No new routes or paid provider calls were introduced.
- Frontend proxy default/example/current local override target the existing backend on `http://127.0.0.1:3100`. ASI_API_ORIGIN wins; generic PORT remains the frontend server's port. Local override is ignored by Git.

Backend startup required one supporting fix: explicit process environment now wins over `.env.runtime`, which wins over `.env`. The general administrator connection no longer replaces the protected runtime connection. Roles/passwords and database contents were not changed. Local loopback listeners remain private and readiness still requires the real safe runtime role, schema and checksums.

Validation: frontend tests (68), TypeScript, ESLint, production Next webpack build with one worker. Real PostgreSQL HTTP acceptance uses the actual frontend parser/body builder/client for health, session reads, projects/CAS, pagination, conversations/messages, exact upload/download bytes, settings, budgets, and provider registration/editing with no credential/no external inference. The full backend suite passed 121 tests; additional runtime configuration and identity/lifecycle checks passed 17. Existing backend provider contract tests independently cover the qualified transport boundaries; this task does not repeat paid live qualification.

Run from this folder: `npm run dev -- --hostname 127.0.0.1 --port 3200`, or use `npm run build -- --webpack` followed by `npm run start -- --hostname 127.0.0.1 --port 3200`. The trusted native launcher still issues the challenge; database passwords/provider keys are never entered in the browser. For failed/unknown native exports, reconcile the recorded destination rather than blindly creating another effect. Planning, arbitrary terminal execution, autonomous coding, run streaming, memory and deployment remain gated by later stages.

## Retained chat preview

The pre-existing `/api/chat` route is a separate OpenUI/beUI preview, not governed Stage 07 execution. Its provider variables are only needed if that preview is used. No provider keys are needed for the studio to connect to the backend. `npm run generate:library` remains available to regenerate the preview component registry.
