# Implementation evidence and active work

**Latest completion task:** [Stage 06 completion record](21-STAGE06-COMPLETION.md) adds the OpenAPI contract, encrypted model output, stricter routing/accounting, and migration 013. All 112 regressions pass. Owner-approved application-role credential recovery, protected configuration, encrypted backup, migration 013, real database readiness/checksums, and composed backend startup/session acceptance passed. Stage 06 is locally qualified for the selected compatible endpoint; official OpenAI remains live-unverified.

**Current gate, 2026-10-22:** [PostgreSQL](15-LOCAL-POSTGRESQL-QUALIFICATION.md), [local identity/session](16-LOCAL-IDENTITY-QUALIFICATION.md), [projects/conversations/artifacts (Stage 04)](17-LOCAL-PRODUCT-QUALIFICATION.md), and [policy/approvals/budgets/audit (Stage 05)](18-LOCAL-GOVERNANCE-QUALIFICATION.md) are locally qualified. Stage 05 is composed into normal startup with migrations 001-013, deterministic policy evaluation, digest-bound approvals, capability grants, atomic budget reservations, usage accounting, and hash-chained audit. Stage 06 provider abstraction, official OpenAI adapter, operator-allowlisted OpenAI-compatible adapter, model registry, hard-filter router, and usage reconciliation are implemented and tested against disposable PostgreSQL and injected transports. A capped live OpenAI-compatible call succeeded, and live bad-auth, 429, and timeout paths are now qualified against that endpoint; the official OpenAI target remains **live-unverified** because official OpenAI rejected the configured credential; see [Stage 06 provider status](19-LOCAL-PROVIDER-QUALIFICATION.md). The full regression suite passed 112 tests with zero failures or skips. No roadmap stage is production-qualified.
Date: 2026-10-22. Base revision: `df658e3d`. This records observed implementation evidence; it is not production release qualification or approval of future effects. The original product idea is unchanged.

## Verified foundations

- Installed and exactly pinned backend dependencies; retained npm installation scripts remain disabled. A lockfile is included.
- Replaced fabricated TypeScript declarations with real strict compilation and declaration emission for contracts, the HTTP gateway boundary, and its explicit test fixture. Contracts import the installed `zod/v4` entry point directly. Legacy JavaScript checking is incremental; this does not claim every retained module is strictly checked or built.
- Restored the immutable SQL files' original LF bytes and added a Git attribute preventing Windows checkout conversion from changing checksums.
- PostgreSQL 17.11 is installed locally. Official pgvector 0.8.7 source, commit `f37c13f68b57d2c3472b2214fbcff699d6d34876`, was built with the installed Visual Studio x64 tools and installed with Windows elevation. Source/build files are machine-local under ignored `data/tools/`.
- Provisioned a fresh `asi_local` database. Existing databases were not changed. Runtime and migrator credentials are separate and stored in ignored Windows ACL-protected `.env.runtime` and `.env.admin` files. Runtime cannot create tables or bypass RLS.
- Readiness checks extension availability, all required schemas, applied migration checksums (001–010 for Stage 05), and runtime role privileges. A reachable database alone cannot pass.
- Real database tests cover fresh migrations, replay, journal immutability, checksum drift, missing scope, pooled context reset, cross-workspace writes, composite project/event references, rollback, role separation, pgvector exact search, and native backup/restore.
- Encrypted backup tests additionally exercise Windows DPAPI, AES-256-GCM authentication, ciphertext tampering, restore into an empty database, and refusal to overwrite an occupied target. This qualifies same-account local recovery, not recovery after losing the Windows account or on a fresh host; portable key recovery remains a release-stage requirement.
- Session integration tests exercise a real ACL-protected launcher file, hashed tokens, challenge expiry/replay/concurrency, nonce mismatch, session expiry/rotation/revocation, CSRF/Origin/Host checks, worker impersonation, and killing/restarting actual HTTP child processes without losing sessions.
- Stage 04 product services (projects, conversations, messages, uploads, operations, and encrypted artifact store) are composed into the production container root and pass strict input validation, optimistic concurrency CAS (`If-Match`), monotonic sequence allocation, quarantine enforcement, download safety headers, and archive constraints.
- Native repository snapshot capture passes committed, dirty, untracked, deleted, junction, and credential-refusal test suites.

## Commands and configuration

Run from the repository root in PowerShell:

```powershell
npm ci --ignore-scripts
npm run build
npm run lint
npm test
npm run test:product
npm run test:governance
npm run test:providers
npm run test:identity
npm run test:postgres
npm run db:verify -- --stage06
npm run db:migrate -- --stage06 --plan
npm run provider:verify
npm run identity:verify
npm run db:backup
npm run session:challenge
npm start
```

`npm run db:setup` is a fresh-install command only. It refuses existing database/role/configuration names and never resets them. The initial administrator connection comes from the existing ignored `.env` file or `DATABASE_ADMIN_URL`. Subsequent startup uses `.env.runtime`; administrative commands use `.env.admin`. Never commit these files or paste their contents into reports.

Migration application makes an encrypted backup first and refuses the `postgres`, `template0`, and `template1` maintenance databases. Offline migration plans/checksums do not prove live schema correctness.

`npm run session:challenge` delivers a one-time challenge through a file restricted to the current Windows user and SYSTEM. It prints the file path, never the challenge bytes. A trusted local client consumes that file and POSTs its JSON to `/api/v1/session/bootstrap` with an allowed Origin. The file expires logically after 60 seconds; the database enforces single use. There is no public challenge-issuance route. Logout requires CSRF, Origin, and an Idempotency-Key.

## Active implementation and limits

Latest local checks on 2026-10-22: `npm run build` and `npm run lint` passed; `npm test` passed 112 tests with zero failures or skips, including disposable PostgreSQL fixtures, identity restart, encrypted content, backup restore, product APIs, native repository capture, governance policy truth tables, approval replay/expiry races, concurrent budget reservations, provider hard filters, official OpenAI and compatible transport behavior with injected responses, a capped real OpenAI-compatible call with usage reconciliation, and unknown-usage handling.

Capabilities report `identity.sessions`, `projects`, `governance`, and `providers` available. Planning, live paid inference, durable tool execution, Windows hostile-code isolation, independent application verification, schedules, deployment, and release packaging remain unqualified and disabled (`ROADMAP_STAGE_NOT_QUALIFIED`).

The official OpenAI target remains live-unverified until an accepted official key is configured and `npm run provider:verify` records a real capped OpenAI call with reconciliation evidence. Live bad-auth, 429, and timeout behavior are now qualified against the real OpenAI-compatible endpoint; see the live-probe rows in [Stage 06 provider status](19-LOCAL-PROVIDER-QUALIFICATION.md).

## Official extension installation reference

Windows build procedure and supported extension setup: [pgvector documentation](https://github.com/pgvector/pgvector#windows). The machine-local installer is `scripts/install-pgvector.ps1`; its source commit check and target paths are explicit. It installs extension files, not database contents.
