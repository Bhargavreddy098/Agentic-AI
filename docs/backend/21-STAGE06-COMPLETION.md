# Stage 06 completion work — 2026-10-22

Scope: finish provider abstraction and one real-provider qualification under Stage 06. Stage 07 dispatch, leases, effect recovery, and goal workflows are not implemented here. The previously qualified compatible endpoint is the selected real-provider target; the official OpenAI target remains live-unverified and is not required as a second provider to meet this stage's one-provider exit gate.

## Implemented

- Shared strict provider request/response schemas and generated [Stage 06 OpenAPI](api/stage06.openapi.json). `npm run api:providers` regenerates it. Contract tests reject stale exports and unresolved local references; actual HTTP responses are checked against the same schemas.
- Credentialed CORS preflight for provider/model/routing routes, including `If-Match`. Host, Origin, opaque owner session, and write CSRF checks remain enforced. A successful preflight never grants authentication.
- Durable routing-preview response replay; changed input under the same key conflicts. PATCH replay now binds the expected version as well as the body. Completed discovery replay returns the persisted operation without another network request; malformed/missing idempotency keys are rejected before discovery.
- A bounded reusable transport cache preserves circuit-breaker state across service calls. This is ephemeral transport health, not a database fallback. Credential changes select a different cached transport.
- Dispatch checks provider health, the selected model's qualified input/output limits, privacy classification, policy egress rules, and conservative price/budget constraints. Prompt UTF-8 byte length plus a 512-token envelope allowance provides a conservative input estimate when greater than the caller estimate; it is not claimed to be an exact tokenizer. Unknown/over-ceiling actual usage still blocks settlement.
- Missing, negative, or inconsistent primary token usage is rejected by both adapters. Unknown usage/outcomes retain reservations and block blind retry; failed authentication and circuit-open refusals are known not to have incurred a generation charge. Known provider output and accounting must be persisted before a call becomes succeeded.
- Successful model output is stored as an authenticated encrypted artifact. A composite workspace/project FK pins the exact output artifact. Existing successful attempts can replay the persisted bytes after service reconstruction without another generation or charge. Terminal output evidence cannot be reassigned or altered.
- Duplicate internal probe operation keys never redispatch an accepted attempt. Unknown/running/failed attempts require review rather than a hidden retry. Full crash reconciliation belongs to Stage 07; it is not claimed here.
- Public discovery with `probe:true` now fails closed instead of pretending it performed a capability probe. The current HTTP DTO lacks a project budget/grant binding. Project-scoped, capped inference qualification remains available through the trusted `provider:verify` command. Future goal-linked invocation is deferred to its roadmap dependency, not implemented with an unscoped spending endpoint.

## Forward migration and recovery

`013-inference-output-artifacts.sql` is expand-only: nullable `output_artifact_id`, composite scoped FK, lookup index, and output-evidence immutability trigger. It does not invent or backfill historical model output. No migration 001–012 was edited. Migration 013 SHA-256:

`3311bd444d94720e0696297679fceef8e9b807388f9b2c237fd730447beb3582`

Fresh disposable PostgreSQL qualification applies through 013. Recovery for an application upgrade is an encrypted pre-migration backup, tested restore to a fresh database, and retaining existing artifacts referenced by backups. No destructive down migration is supplied. Previous binaries can ignore the nullable new column, but existing terminal-output immutability must not be bypassed.

## Qualification evidence

- `npm run test:providers`: 24 tests passed with no failures/skips, including generated contracts, HTTP preflight/replay, encrypted output replay, cross-project FK denial, terminal evidence protection, privacy/context/health denial, unknown usage, and the service-level circuit breaker.
- `npm test`: 112 tests passed, zero failures/skips. The first run identified a retained hardcoded 12-migration assertion; it was updated to explicitly expect the new 13-file manifest, preserving checksum and repeat checks.
- `npm run build` and `npm run lint`: passed after the implementation changes.
- The existing compatible-provider positive and negative live evidence is recorded in [provider qualification](19-LOCAL-PROVIDER-QUALIFICATION.md). No new paid request or burst was run during this completion task. Official token-usage field semantics were checked against [OpenAI token counting](https://developers.openai.com/api/docs/guides/token-counting) and [Chat Completions usage](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Rejecting missing usage is the application's conservative accounting policy, not a claim that every compatible endpoint always returns usage.

Local rollout is **PASS** on 2026-10-22. With explicit owner approval, `npm run db:recover-config -- --apply` rotated only the two application-role passwords and recreated ignored, ACL-protected `.env.runtime` and `.env.admin`. The administrator password and database data were preserved. Existing processes must reload their configuration.

`npm run db:migrate -- --stage06` created an encrypted pre-migration backup at `data/backups/database-1792682783051-3d688b1e-66f5-4479-97d7-d4d8a37320ed.asbak` and applied only migration 013. `npm run db:verify -- --stage06` returned ready: PostgreSQL, pgvector, all schemas, migration journal/checksums 001–013, and runtime-role checks passed. `npm run identity:verify` passed actual composed backend readiness, native launcher, session bootstrap, protected routes, HEAD denial, and revocation.

**Stage 06: locally qualified for the selected compatible provider.** No remaining Stage 06 installation blocker was observed. Official OpenAI remains an optional, live-unverified second target. Stage 07 and production release qualification are not claimed. The 112-test suite includes encrypted output replay after service reconstruction and real database restore tests; this rollout did not restart the shared PostgreSQL Windows service.
