# Local PostgreSQL Stage 02 qualification

Inspected and tested on 2026-10-22. Stage 02 is qualified on this local installation. The owner approved changing the shared PostgreSQL listener and restarting its Windows service; both actions completed and post-restart qualification passed.

## Local configuration

1. **Version:** retain the repository's PostgreSQL 17 baseline. The actual server is 17.11. Other majors were not qualified by this run.
2. **pgvector:** 0.8.7 is installed on the server and enabled in `asi_local`. No installation is needed. The npm package alone would not install the server extension.
3. **Database:** `asi_local` already exists. Do not create a replacement or migrate the `postgres` maintenance database.
4. **Runtime role:** `asi_local_runtime` is LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS; not a table owner and no schema CREATE. Grant schema USAGE and required table/sequence DML only. The migration journal is read-only. Do not grant migration-owner membership.
5. **Migration role:** `asi_local_migrator` owns application objects and performs DDL; it is not a superuser or the runtime identity. Extension provisioning is a privileged installer action. Test administration needs permission to create/drop its own test databases/roles and provision vector. Never give those privileges to runtime.
6. **Variables:** runtime `DATABASE_URL`; migration `MIGRATION_DATABASE_URL`; test administration `TEST_DATABASE_ADMIN_URL`. Migration backup requires `DATABASE_BACKUP_URL` or the existing `TEST_DATABASE_ADMIN_URL` fallback. Keep the explicit migration variable instead of relying on the supported `DATABASE_URL` fallback.
7. **Values:** use the placeholders below; substitute locally and percent-encode special characters in URL credentials. Never paste passwords into chat/logs.
8. **Files:** `.env.runtime` for runtime; `.env.admin` for migration/test/backup. Both already exist, are ignored, and were verified untracked. `.env.example` contains placeholders. Root `.env` is also ignored. Do not copy admin credentials into runtime configuration. Do not rerun fresh-install `db:setup`: these resources exist and that command includes later-stage setup.
9. **Connection check:** `npm run db:verify -- --stage02` checks actual connectivity plus vector, schemas, safe runtime role, and journal checksums.
10. **Migrations:** `npm run db:migrate -- --stage02` backs up first and applies only 001–004. `npm run db:migrate -- --stage02 --plan` checks the file/checksum plan without connecting.
11. **Applied migration status:** `npm run db:verify -- --stage02` lists each foundation migration and verifies its checksum. `--offline` checks files only, not database status.
12. **Integration tests:** `npm run test:postgres`. Tests now build only Stage 02 in disposable databases on the same real server; identity/snapshot/provider/memory implementations are not prerequisites.

```dotenv
# .env.runtime (existing ignored file)
DATABASE_URL=postgresql://asi_local_runtime:<URL_ENCODED_RUNTIME_PASSWORD>@127.0.0.1:5432/asi_local
# Optional defaults:
DATABASE_POOL_MAX=5
DATABASE_TIMEOUT_MS=5000
DATABASE_STATEMENT_TIMEOUT_MS=15000

# .env.admin (existing ignored file)
MIGRATION_DATABASE_URL=postgresql://asi_local_migrator:<URL_ENCODED_MIGRATION_PASSWORD>@127.0.0.1:5432/asi_local
TEST_DATABASE_ADMIN_URL=postgresql://<LOCAL_ADMIN_ROLE>:<URL_ENCODED_ADMIN_PASSWORD>@127.0.0.1:5432/postgres
# Optional dedicated backup identity, otherwise the test-admin fallback is used:
# DATABASE_BACKUP_URL=postgresql://<BACKUP_ROLE>:<URL_ENCODED_BACKUP_PASSWORD>@127.0.0.1:5432/asi_local
```

Native utilities default to `C:/Program Files/PostgreSQL/17/bin`; the existing optional `POSTGRES_BIN` overrides that path. There is no SQLite, Map, or filesystem database fallback. Encrypted backup files are recovery artifacts, not an alternative runtime database.

## Verification evidence

| Check | Observed result |
| --- | --- |
| Existing `asi_local` connection | PASS; PostgreSQL 17.11, separate safe runtime role |
| pgvector | PASS; 0.8.7 installed, real exact cosine search tested |
| Existing migration journal | PASS; 001–004 match pinned checksums |
| Existing database migration replay | PASS; encrypted backup made, zero migrations applied |
| Clean migration/repeat | PASS; all four applied to an empty disposable DB, repeat applied zero; identity sessions table absent |
| Checksum validation | PASS; altered source manifest rejected; corrupted disposable journal rejected and readiness became unavailable |
| Commit, rollback, constraints | PASS; committed writes persist, rollback removes writes; unique, check, not-null, composite FK violations rejected |
| RLS/context cleanup | PASS for implemented workspace policies: absent scope denies rows, cross-workspace reads/writes denied, same pooled connection reused across scopes, local settings cleared after success/failure |
| Project references | PASS; cross-workspace/project composite references rejected. Stage 02 RLS is workspace-level; per-project authorization policies are not claimed here |
| Pool shutdown | PASS; repeated close drains pool; checkout after shutdown rejected |
| Restart persistence | PASS; one Node process commits/closes, another reads its durable record. The existing application schema/journal also survived the subsequently approved PostgreSQL service restart |
| Health/readiness | PASS in Stage 02 composition: real dependencies return 200; unavailable PostgreSQL returns 503; liveness stays 200 |
| Backup/restore | PASS; native restore succeeds; DPAPI/AES-GCM backup restores; tamper rejected before restore; occupied target refused |
| Private listener | PASS; effective `listen_addresses='localhost'`; actual listeners are only `127.0.0.1:5432` and `[::1]:5432` |

`npm run test:postgres`: 14 tests passed, zero failures/skips. Foundation unit/HTTP tests: 14 passed after granting the runner loopback access; the first sandboxed HTTP attempt failed with EACCES. Build and lint passed. Test databases/roles were cleaned up; existing databases were not reset.

The application journal also contains previously applied 005–006; they were left intact. Pending 007–008 were not applied. `--stage02` reports only the foundation gate. Subsequent Stage 03 qualification made normal startup require its active 001–006 schema and disabled unqualified Stage 04 services; see [the identity qualification record](16-LOCAL-IDENTITY-QUALIFICATION.md). Full-plan verification remains available without a stage flag.

## Approved maintenance and post-restart verification

The owner explicitly approved the private-listener change and shared-service interruption. Through the existing local administrator connection, this change was applied:

```sql
ALTER SYSTEM SET listen_addresses = 'localhost';
```

Then in a Windows Administrator shell:

```powershell
# Briefly disconnects clients of every database on this service.
Restart-Service -Name postgresql-x64-17
```

The verified service `postgresql-x64-17` was restarted through the explicit administrative helper `scripts/restart-local-postgres.ps1`. The server start time returned by PostgreSQL was 2026-10-22T09:30:40.802Z (15:00:40.802 Asia/Calcutta). The effective setting is now `localhost`, and the actual TCP listener inventory contains only `127.0.0.1` and `::1` on port 5432. Existing SCRAM authentication rules were preserved.

After the service restart, `asi_local` retained its migration journal (001–006). `npm run db:verify -- --stage02` returned ready with all dependency/role/checksum flags true. `npm run test:postgres` passed all 14 tests with zero failures/skips, including encrypted backup/restore and application-process restart persistence. No database reset, credential change, or later migration application occurred. No Stage 02 blockers remain. Per the owner's instruction, the next work is Stage 03 identity/session verification.

The next dependency was then checked with `node --env-file-if-exists=.env --env-file-if-exists=.env.admin --test backend/tests/identity-integration.test.js`: all 8 tests passed, including native launcher ACLs, challenge replay/expiry, Host/Origin/CSRF enforcement, worker impersonation denial, session revocation, and restart persistence. This was verification of the existing Stage 03 implementation; snapshot feature expansion was not resumed.
