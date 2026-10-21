# Express migration execution ledger

User approved architecture and sequential implementation. Branch: codex/express-backend. Preserve the existing dirty checkout and earlier uncommitted OpenClaw work. No blanket commit or unrelated data mutation.

Tasks 1–6: source enforcement, native Express layers, owner-port API parity, PostgreSQL helpers, migration runner and physical relocation implemented. Related endpoints share domain files rather than empty per-endpoint boilerplate. Existing TypeScript domain ownership is preserved.
Task 7: HTTP adapter compatibility, lifecycle, missing-database readiness and unsupported-operation behavior tested. OpenClaw browser qualification is unavailable: adapter source is not yet a runnable frontend workspace. No live auth/provider/durable UI owner composition exists by default.
Task 8: build/lint/typecheck, 17 native tests, 74 focused tests, scanners, migration hashes and upstream hashes pass. Full original unit run: 701 pass, 2 existing UI evidence failures and 2 worker spawn errors; interrupted files pass separately. Protected-file gate reports uncommitted approved migration changes; no bypass or blanket commit.

Rulings:
- Keep this checkout to preserve existing uncommitted source; do not copy it into a clean worktree and lose OpenClaw changes.
- Keep canonical contracts and frontend outside backend. Preserve 19 module and 8 worker names/process boundaries.
- No user RBAC, provider spend, production database migration, automatic extension DDL or synthetic-to-live promotion.
- New JavaScript has checkJs with contextual/explicit annotations; existing TypeScript remains strict. JavaScript noImplicitAny is disabled for gradual controller typing.
- SQL bytes unchanged for all 15 migrations. Existing migration DAG, advisory lock and checksum journal retained.
- Root protected modules remain protected at relocated paths. Git status buffer enlarged for the upstream import; enforcement retained.
- Do not rewrite vendor hashes or old wire evidence merely to pass unrelated checks. HEAD comparison proves the two existing UI evidence failures.
- PostgreSQL 17 disposable commit/rollback and actual missing-vector pool readiness PASS; all temporary test clusters stopped. pgvector extension unavailable, live vector correctness pending.
- Reviewer found and verified fixes for memory visibility, cwd-independent env loading and backend tests in root verify.

Canonical detailed evidence: docs/release-evidence/express-backend-migration.md.
