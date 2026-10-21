# Express backend migration evidence — 2026-10-21

The user approved consolidating the existing backend under `backend/` and using Node.js, Express, PostgreSQL and pgvector. Implementation is on `codex/express-backend`. Changes remain uncommitted because the checkout also contains earlier OpenClaw work and other local changes.

## Implemented

- Root `@asi/backend` workspace with `server.js`, importable `app.js`, config, routes, controllers, services, schemas, models and middleware. Related smaller endpoints share domain controller/route files rather than adding empty per-endpoint layers.
- Nineteen backend modules and eight isolated worker apps relocated without changing package names. `backend/RELOCATION.json` records paths, package names and component owners. Existing domain SQL ownership and SQLite episode authority remain unchanged.
- Native Express session, origin/CSRF, request identity, request limits, raw upload parsing, safe errors, versioned API and bounded server shutdown. Existing UI DTOs and injected domain ports preserve conversation commands, replay and upload contracts. SSE currently replays an owner-provided batch and closes, matching the inherited route; it does not establish a new live subscription service.
- PostgreSQL pooling, safe readiness, one-client transactions and a parameterized vector helper with finite 1536-dimensional input validation and explicit tenant/model/memory visibility filters. The helper is not exposed as an independent public memory route. Existing broker ownership remains authoritative.
- Explicit migration tooling moved under `backend/database`; the original script remains a compatibility entry. All 15 PostgreSQL/SQLite migration files retain their captured SHA-256 values, recorded in `backend/database/migration-checksums.json`.
- Architecture and dependency enforcement recognizes new paths. Protected policy/identity/audit globs include relocated modules. Root verification invokes backend JavaScript typechecking and native tests. The protected-file scanner's output buffer was increased to handle the existing 21,131-file untracked upstream import without truncating Git status.
- `.env` resolves relative to `server.js`, so root and workspace launch commands use the same file. Exact dependency versions and lockfile are qualified.

## Checks actually run

| Check | Result |
| --- | --- |
| Frozen install, pnpm 12.6.0, 33 workspace projects | PASS |
| Full sequential workspace build, including Next.js production build and backend checkJs | PASS |
| Root TypeScript and backend JavaScript typechecking | PASS |
| Root ESLint | PASS |
| Native backend HTTP/security/transaction/vector/lifecycle/relocation tests | 17 PASS |
| Focused architecture, OpenClaw, reducer and episodic worker tests | 74 PASS, 9 files |
| Architecture scan | PASS, 419 files |
| Dependency inventory | PASS, 33 manifests |
| Traceability scan | PASS |
| `git diff --check` | PASS; Git emits normal LF/CRLF warnings |
| OpenClaw upstream import integrity | PASS, 21,131 files, pinned `844b03541a8bdbc01f1bbac3c218d1b579123a12` |
| Migration byte preservation and both runner entry points | PASS |
| Disposable PostgreSQL 17 commit/rollback | PASS |
| Actual pool readiness against disposable PostgreSQL without vector | PASS: `{postgres:true,vector:false}`; no runtime DDL |
| Full original unit run against disposable PostgreSQL | 701 PASS, 2 existing UI evidence failures; 2 additional suites interrupted by Windows process spawning, then passed in the focused run |
| Protected-file gate | Reports pending uncommitted protected changes, as designed; no bypass added |

The initial concurrent build/test run exhausted memory. Running the workspace build sequentially completed successfully. The full unit run also emitted Vitest worker start/termination and timer overflow errors for two files; both files passed separately. These infrastructure errors are not counted as a clean full-suite run.

## Existing UI evidence failures

1. The wire receipt expects digest `94221199d337e54975bec742eb7145902c1c2953549c2b21e5ec031300c4996b`, while both HEAD and the current UI contract index normalize to `a135be6f11242b558a4d9b679eacadc788fd5441a1a40e648896465ac95416fb`. The migration did not change that index. The existing compatibility receipt needs separate reconciliation.
2. The source checker hashes raw bytes. Eight vendored/review text files have Windows CRLF checkout bytes, while their recorded digests equal both HEAD blob bytes and LF-normalized checkout bytes. This migration did not rewrite vendor files or rehash the inventory to hide the failure.

## Qualification limits

PostgreSQL 17 is installed locally; the PostgreSQL `vector` extension is not. Live nearest-neighbor correctness remains unqualified until the extension is installed and provisioned in a disposable qualification database. No existing database was migrated or modified; test clusters were stopped after use.

The default Express composition has no production authentication or durable UI owner wiring. It refuses unknown session assertions and never substitutes synthetic ports. A healthy listener is not a live chat/provider capability. No genuine provider generation, sandbox task, production login or end-to-end product workflow is claimed.

The existing OpenClaw adapter and its capability filtering are transport-tested. `apps/openclaw` currently contains adapter source, not a complete runnable UI workspace, so a new OpenClaw desktop/mobile browser run could not be qualified in this migration. Existing Next.js frontend builds; its explicit demo launcher remains available. Browser appearance and deployment were not changed.

The read-only reviewer found vector visibility, working-directory environment loading and missing root test wiring issues. All three were fixed and re-reviewed; no remaining Critical or Important finding was reported for those fixes.
