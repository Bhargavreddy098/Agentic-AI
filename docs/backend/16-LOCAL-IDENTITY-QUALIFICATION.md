# Stage 03 — local identity and session qualification

Date: 2026-10-22. Stage 02 prerequisites are documented in [local PostgreSQL qualification](15-LOCAL-POSTGRESQL-QUALIFICATION.md). This task completes the next dependency, Stage 03, without enabling Stage 04 product services. The original product idea is unchanged.

## Implemented boundary

Normal `npm start` composes PostgreSQL and the durable local identity port only. It refuses startup unless PostgreSQL/vector, migrations 001–006, and least-privilege runtime-role checks pass; a migration/admin connection cannot start the owner API. It does not initialize the artifact store or require pending Stage 04 tables. Later product modules remain preserved in source; their existing regression fixture must explicitly opt into test-only composition. That option is rejected outside `NODE_ENV=test` and is not exposed through production CLI/configuration. Capabilities report identity available and later-stage operations disabled.

The public implemented surface is `POST /api/v1/session/bootstrap`, `GET /api/v1/session`, `DELETE /api/v1/session`, `GET /api/v1/workspaces`, and `GET /api/v1/capabilities`. HEAD follows authenticated GET routing, including case/trailing-slash aliases handled by Express. Health endpoints remain public. Unknown/unfinished product routes cannot obtain an anonymous identity.

The native `session:challenge` command writes a random single-use challenge and client nonce into an ACL-protected file under `data/launcher`, restricted to the current Windows user and SYSTEM. It prints only the file path. There is no HTTP challenge issuance endpoint. Challenge lifetime is 60 seconds; replay, expiry, wrong nonce, revoked owner, and worker identities are refused. PostgreSQL stores only capability hashes.

Sessions use random opaque cookie tokens, hashed database lookup, an eight-hour absolute lifetime, a thirty-minute idle lifetime, owner/status rechecks, rotation on bootstrap, and durable sign-out. Cookie attributes are HttpOnly, SameSite=Strict, Path=/api/v1 on local loopback HTTP. The CSRF token is deterministically derived from the cookie secret and its hash is persisted; GET does not rotate CSRF. Only the intended CSRF value is returned in the Session DTO, never the cookie token.

Host validation, exact allowed Origin validation, and mutation CSRF checks remain trusted HTTP enforcement. Allowed browser Origins receive credentialed CORS responses. Preflight is limited to identity routes, their supported methods, and the required header allowlist. Preflight does not grant authentication or perform mutations. Canonical `/api/v1` errors use the specified problem envelope; legacy error aliases remain limited to older paths. Rate-limit failures use the same problem handler.

Worker connection and secret-reference metadata have scoped constraints/RLS; owner principals cannot be inserted as workers. Secret-reference records contain metadata only. Stage 03 does not implement worker execution, signing authority, provider credentials, or a public secret-read API.

## Migrations and local commands

No applied migration bytes were changed in this task. Existing 005–006 provide the Stage 03 schema and were already present in `asi_local`. `--stage03` restricts migration/verification to 001–006; conflicting stage flags and unrecognized arguments are rejected. The complete manifest is still checked for file tampering. Readiness rejects known applied-checksum drift and unknown journal entries; it does not accept a reachable database alone.

```powershell
# Uses existing ignored .env.runtime:
npm run db:verify -- --stage03
npm run identity:verify

# Uses existing ignored .env.admin; only needed if Stage 03 migrations are pending:
npm run db:migrate -- --stage03

# Disposable Stage 03-only PostgreSQL database and native Windows checks:
npm run test:identity

# Build and regressions:
npm run build
npm run lint
npm test
```

`identity:verify` is an explicit local acceptance check. It starts an ephemeral loopback HTTP server using the real runtime connection, checks readiness, obtains a real ACL-delivered launcher challenge, bootstraps one temporary owner session, reads protected endpoints, checks anonymous HEAD denial, revokes the session, deletes its own challenge file, and closes its resources. It receives no administrator/provider credentials. Failures are sanitized. It needs exactly one provisioned active local owner workspace, matching the native launcher contract.

The machine-readable implemented contract is [Stage 03 OpenAPI](api/stage03.openapi.json). Integration checks validate its local references and the Session response shape against it.

## Acceptance evidence

| Requirement | Evidence/result |
| --- | --- |
| Real database prerequisite | PASS; Stage 02 qualified, PostgreSQL 17.11 / vector 0.8.7, loopback-only |
| Clean migration and repeat | PASS; fresh fixture applies exactly six migrations, replay applies zero; Stage 04 artifacts table absent |
| Native protected bootstrap | PASS; actual Windows ACL inheritance protection, challenge delivery, no raw stdout token |
| Expired/replayed/racing challenges | PASS; one winner under concurrent bootstrap, wrong nonce/expiry/replay rejected |
| Session identity and persistence | PASS; hashed database tokens; separate HTTP processes retain the same valid session after termination/restart |
| Expiry, rotation, revocation | PASS; idle/absolute expiry, old-token invalidation, revoked owner/worker rejection, repeated sign-out, conflicting logout replay |
| Request authorization | PASS; hostile Host/Origin, forged cookie, forwarded principal, missing CSRF/Origin, unauthenticated GET/HEAD/case/slash variants denied |
| Credentialed browser boundary | PASS; exact Origin preflight allowed; hostile Origins and identity-spoofing request headers denied |
| Scope and metadata | PASS; capability-hash session/challenge RLS denies unscoped reads; worker/secret metadata scoped reads and composite owner FKs enforced |
| Safe output | PASS; Session fields match contract; no cookie token in JSON; raw session/challenge values absent from captured HTTP logs; safe correlated errors |
| Real installation | PASS; `db:verify -- --stage03` returns ready; `identity:verify` passes on existing `asi_local` |
| Regression | PASS; 73 tests, zero failures/skips; build and lint passed. Follow-up targeted identity/foundation checks passed 21 tests, including canonical rate-limit problems and rejection of unqualified production composition |

Initial expanded tests exposed fixture assumptions (one session after adding a second valid bootstrap, and a missing vector extension in the Stage 03-only fixture). Fixtures were corrected to target the intended session and provision the actual extension with the administrator, without relaxing assertions or enabling later migrations.

No Stage 03 blockers remain after the checks recorded above. Stage 04 projects/conversations/snapshots/artifacts is the next roadmap dependency and remains unqualified. No provider inference, orchestration, tools, memory, schedules, or deployment was enabled in this task. Windows release packaging and portable secret recovery remain later release requirements.
