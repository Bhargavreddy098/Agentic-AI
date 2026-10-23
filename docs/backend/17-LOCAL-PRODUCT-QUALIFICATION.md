# Stage 04 — Projects, conversations, snapshots, and artifacts qualification

Date: 2026-10-22. Stage 03 prerequisites are documented in [local identity qualification](16-LOCAL-IDENTITY-QUALIFICATION.md). This task completes and qualifies the next roadmap dependency, Stage 04: projects, conversations, messages, content-addressed encrypted artifacts, staged uploads, and native repository snapshot capture. The original product idea is unchanged.

## Implemented boundary

Normal `npm start` composes PostgreSQL, local identity, and Stage 04 product services (`projects`, `conversations`, `artifacts`, `uploads`, `operations`, and the content-addressed blob store). It refuses startup unless PostgreSQL/vector, migrations 001–008, and least-privilege runtime-role checks pass. Unqualified Stage 05+ services remain disabled. Capabilities report `identity.sessions` and `projects` available; later roadmap stages (`planning`, `execution`, `verification`, `memory`, `schedules`, `deployment`) remain disabled with `ROADMAP_STAGE_NOT_QUALIFIED`.

The public implemented surface includes:
- **Identity & Session:** `POST /api/v1/session/bootstrap`, `GET /api/v1/session`, `DELETE /api/v1/session`, `GET /api/v1/workspaces`, `GET /api/v1/capabilities`.
- **Projects:** `POST /api/v1/projects`, `GET /api/v1/projects`, `GET /api/v1/projects/:projectId`, `PATCH /api/v1/projects/:projectId` (optimistic locking with `If-Match`), `POST /api/v1/projects/:projectId/archive`.
- **Conversations & Messages:** `POST /api/v1/projects/:projectId/conversations`, `GET /api/v1/projects/:projectId/conversations`, `GET /api/v1/conversations/:conversationId`, `POST /api/v1/conversations/:conversationId/messages`, `GET /api/v1/conversations/:conversationId/messages`.
- **Artifacts:** `GET /api/v1/projects/:projectId/artifacts`, `GET /api/v1/artifacts/:artifactId`, `GET /api/v1/artifacts/:artifactId/content`.
- **Uploads & Operations:** `POST /api/v1/projects/:projectId/uploads`, `PUT /api/v1/uploads/:uploadId/content`, `POST /api/v1/uploads/:uploadId/complete`, `GET /api/v1/operations/:operationId`.
- **Native repository capture:** bounded read-only inspection of local Git worktrees (`scripts/snapshot-repository.ps1`), denying host paths, credential paths, and NTFS junctions.

Messages have monotonic sequences, idempotent replay, and automatic content encryption into the local artifact store. Raw plaintext message content is never stored unencrypted. Artifact downloads force `attachment; filename="<id>.bin"`, `nosniff`, and compute explicit `content-digest` (`sha-256=:<base64>:`). Range requests return 416 (not supported). Active and unqualified binary content is quarantined.

## Migrations and local commands

Stage 04 migrations `007-project-content.sql` and `008-content-operations.sql` define the product tables, artifact metadata, links, conversation containers, messages, upload staging, and durable operations. `--stage04` restricts verification and planning to migrations 001–008.

```powershell
# Verify Stage 04 database readiness (offline and online):
npm run db:verify -- --offline --stage04
npm run db:verify -- --stage04

# Apply Stage 04 migrations with automatic encrypted pre-migration backup:
npm run db:migrate -- --stage04

# Run Stage 04 product and snapshot integration tests:
npm run test:product

# Run Stage 03 identity regression tests:
npm run test:identity

# Run PostgreSQL qualification tests:
npm run test:postgres

# Full build, lint, and regression suite:
npm run build
npm run lint
npm test
```

The machine-readable implemented contract is [Stage 04 OpenAPI](api/stage04.openapi.json).

## Acceptance evidence

| Requirement | Evidence/result |
| --- | --- |
| Stage 03 identity prerequisite | PASS; Stage 03 qualified, loopback session boundary, ACL challenge launcher |
| Database migrations 001–008 | PASS; all 8 migrations verified offline and applied via migration runner with encrypted backup |
| Normal startup composition | PASS; `npm start` composes PostgreSQL, identity, projects, conversations, artifacts, uploads, operations, and blobs |
| Capabilities projection | PASS; `/api/v1/capabilities` reports `identity.sessions` and `projects` available; later stages disabled |
| Projects API & concurrency | PASS; project creation, workspace isolation, CAS version conflict (`If-Match`), pagination, and archiving pass |
| Conversations & monotonic messages | PASS; conversation containers, monotonic sequence allocation (`1, 2, 3`), exact replay, encrypted storage |
| Encrypted artifact store | PASS; AES-256-GCM encryption with DPAPI purpose-bound key, integrity authentication, quarantine for active content |
| Download safety | PASS; `attachment` disposition, `nosniff`, no range requests, checksum verification |
| Native repository capture | PASS; Git worktree inspection, uncommitted/tracked capture, deletion representation, junction & secret refusal |
| Test suite | PASS; 74 tests pass across unit, integration, security, and lifecycle suites with zero skips or failures |

No Stage 04 blockers remain. Stage 05 (policy, approvals, budgets, and audit) is the next roadmap dependency.
