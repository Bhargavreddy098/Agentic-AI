# Stage 01–06 API reconciliation evidence — 2026-10-23

Authority: `05-API-CONTRACTS.md`, Stage 01–06 roadmap cards, database/security specifications, and the owner's explicit settings and artifact-filter clarifications. The product idea is unchanged. No Stage 07 functionality was implemented.

## Result

The generated [route table](22-FRONTEND-API-RECONCILIATION.md) and [JSON frontend manifest](api/frontend-stage01-06.manifest.json) inventory 50 canonical method/route combinations, including auth profile, CSRF, idempotency, If-Match, request/response DTO references, success status, implementation source and frontend readiness. Generation checks the canonical side for missing required routes as well as rejecting implemented routes absent from the canonical contract. Regenerate with `npm run api:frontend`; drift is tested.

Implemented missing POST project snapshots, GET/PATCH settings, and POST artifact export. Canonical health DTOs now match the specification; older diagnostic aliases retain their payloads and are compatibility-only. Actual session cookie is `asi_local_session`, imported by the manifest from the route constant. Authentication, CSRF, scope and idempotency enforcement remain in trusted code.

Artifact listing is frontend-ready with strict limit/cursor only. The owner explicitly reserved kind until taxonomy/storage semantics are approved and deferred runId until Stage 07 establishes a real ownership relationship. Unsupported filters return 400. This is an approved clarification, not a hidden missing requirement.

Settings privacy and spending limits project the active policy and cannot override it; conflicts return 409. Retention and defaultAutonomy are preferences, not a purge scheduler or execution grant. No fresh human-presence adapter is configured; Owner-H uses the authenticated local owner as documented.

Native snapshot bytes are encrypted and quarantined, indexStatus is not_indexed. Native export accepts only a registered destinationRef and released artifact; Windows directory handles pin the path chain, indirect paths and overwrite are refused. An operation is committed before writing; replay cannot blindly repeat an uncertain effect. A crash after acceptance can leave running/blocked state requiring reconciliation, not automatic retry. The bounded Stage 04 adapter does not claim Stage 07 crash recovery or exactly-once arbitrary effects.

## Verification

- `npm run build`: PASS.
- `npm run lint`: PASS (including new native authorization commands).
- `npm test`: PASS, 119 tests, zero failures/skips after the artifact pagination clarification.
- Additional native registration qualification was then added: `node --env-file-if-exists=.env.admin --test backend/tests/api-reconciliation.test.js backend/tests/frontend-manifest.test.js`: PASS, 8 tests, zero failures/skips, including real scoped root/destination registration commands.
- Real API fixtures cover owner cookie, unauthenticated denial, CSRF, strict settings fields, active-policy conflict, If-Match conflict/replay, service reconstruction, cross-owner settings, exact Git bytes, scoped snapshot result, revoked roots, export replay/overwrite/junction refusal, project-scoped artifact pagination and rejected future filters.
- Canonical health test now asserts exact DTOs; existing dependency-loss qualification still checks HTTP 503 and canonical ready:false. Alias tests preserve old diagnostics; these assertions replaced conflicting old canonical payload expectations without removing failure checks.
- `npm run db:migrate -- --stage06`: PASS. Encrypted pre-migration backup `data/backups/database-1792726902428-846b8e03-257f-4a0a-b8f0-5831a0e03f15.asbak`; only expand-only migration 014 applied. No applied migration 001–013 was edited. Repeated migration applied no files and verified the journal/checksums.
- `npm run db:verify -- --stage06`: PASS; PostgreSQL, pgvector, all 14 checksums, schemas and runtime role ready. New-table runtime privileges were separately checked on the actual local installation.
- `npm run identity:verify`: PASS; actual composed startup/readiness, native launcher/bootstrap, protected routes, HEAD denial and revocation.
- `PRODUCT_IDEA.md` SHA-256 remains `4776824a4ab012e6c6f84c4737906de1f3faf21edbc80314e60cd0c16ad47566`.

## Native setup

Run only as the local owner, with the existing protected runtime environment. These commands return opaque UUIDs; no path or secret is accepted by the HTTP DTO.

```powershell
npm run repository:authorize-root -- --root '<canonical-existing-git-directory>'
npm run artifact:authorize-export -- --project-id '<project-uuid>' --destination '<canonical-new-output-file>'
```

Root registration requires a standalone canonical Git repository and exactly one active local owner. Use its workspaceRootRef when creating an existing project. Export registration requires an existing canonical parent directory and a new filename; it does not authorize overwrite. Only the native owner command receives the local destination path. Runtime remains nonowner/non-superuser and uses scoped SQL. Recovery is encrypted backup/restore to a fresh database; there is no destructive down migration.

Historical Stage 03/04 OpenAPI files remain partial schema references, not the final frontend inventory. The new generated manifest is the reconciled route inventory. Discovery probe:true remains unavailable through HTTP because the qualified public DTO lacks project/grant spending binding; probe:false is supported. Real contract-generation workflows remain Stage 09. Official OpenAI remains live-unverified. No production release qualification is claimed.
