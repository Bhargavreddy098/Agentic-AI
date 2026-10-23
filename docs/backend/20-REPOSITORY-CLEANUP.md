# Repository cleanup — 2026-10-22

The owner requested removal of unwanted files/folders from the workspace. This cleanup removes only the following confirmed leftovers; it does not change backend behavior, database state, qualification gates, or the product idea.

| Removed path | Reason |
| --- | --- |
| `assets/` | Three unused historical PNG diagrams, with no current source/document references |
| `public/` | One unreferenced AI Studio pasted asset from the removed UI |
| `metadata.json` | Old app-builder metadata, not used by the Node backend or its tooling |
| `tests/setup.ts` | Only imported the removed UI's `@testing-library/jest-dom`; no current runner/configuration references it |
| `third_party/` | Unused OpenClaw source snapshot; no active imports or workspace dependency. Source, LICENSE files, and notices are preserved in the recovery archive |

Before deletion, all 368 files were saved with their original relative paths to this ignored machine-local archive:

`data/cleanup/b7eef1fb-fcb1-45ee-918c-e6bb31dfa6a3/removed-files.zip`

Each ZIP entry's length and SHA-256 were verified against the original file before removal. Cleanup targets were resolved and checked inside the workspace. No credential files were included in the archive. The removed paths had no pre-existing Git modifications. Git history was not changed.

Recovery: inspect the ZIP and extract selected entries to a separate staging directory before restoring anything. The archive includes the original `assets/`, `public/`, `third_party/`, and `tests/` prefixes. Do not blindly restore obsolete UI tooling over current files. The archive is local and ignored, so copy it separately if recovery is needed on another machine.

Kept intentionally: backend source and migrations, packages/contracts, architecture/qualification documentation, scripts still referenced by retained tests, root backend/security/protocol tests, evaluation fixtures, infrastructure policies, `.claude` local configuration, package manifests/lockfile, compiler/lint configuration, and installed `node_modules`. Existing tests and security protections were not removed. Historical source/tests remain migration inputs; this cleanup does not claim they are all production-qualified.

The entire `data/` tree outside the new cleanup archive was left untouched, including encrypted backups, protected secrets, and artifact data. `.env`, `.env.admin`, and `.env.runtime` were preserved and remain ignored. `PRODUCT_IDEA.md` remains protected by its recorded SHA-256.

Verification after cleanup: `npm run build` and `npm run lint` passed; `npm test` passed all 101 tests with zero failures/skips, including disposable PostgreSQL and injected provider transports. No paid provider probe was run. The original product hash remains `4776824a4ab012e6c6f84c4737906de1f3faf21edbc80314e60cd0c16ad47566`. `git diff --check` passed for the touched tracked documents. These checks preserve the existing backend baseline; they do not qualify a new roadmap stage.
