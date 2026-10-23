# Stage 06 - Provider abstraction and adapter status

Date: 2026-10-22. Stage 05 prerequisites are documented in [local governance qualification](18-LOCAL-GOVERNANCE-QUALIFICATION.md). This record covers the Stage 06 provider port, official OpenAI adapter, operator-allowlisted OpenAI-compatible adapter, model registry, hard-filter router, usage normalization, and migrations. The original product idea is unchanged.

## Current result

**Completion work update:** [Stage 06 completion record](21-STAGE06-COMPLETION.md) documents the generated OpenAPI contract, encrypted output artifacts, replay/accounting fixes, forward migration 013, and 112 passing regressions. Owner-approved application-role recovery, encrypted backup, migration 013, live readiness/checksum verification, and composed startup/session acceptance all passed. Stage 06 is locally qualified for the selected compatible provider.

Stage 06 is **implemented and locally tested** against disposable PostgreSQL and injected transports. An operator-allowlisted OpenAI-compatible endpoint has made a **successful capped live call**, and the live negative paths have now been qualified against that same real endpoint: revoked auth, rate limiting, and timeout. The official OpenAI target remains **UNVERIFIED**: its configured credential was rejected with `PROVIDER_AUTH_FAILED`, so no official inference request was made. Stage 06 is not production-qualified.

Normal startup composes Stage 06 providers with PostgreSQL, local identity, Stage 04 product services, and Stage 05 governance. Startup requires migrations 001-013.

## Implemented boundary

- Provider port with `discoverModels`, `health`, `generate`, and `stream`; cancellation is represented by the caller's `AbortSignal` and bounded deadlines.
- Official OpenAI adapter using the Responses API at `https://api.openai.com/v1`, with `gpt-5-mini` as the only qualified official profile.
- OpenAI-compatible adapter using Chat Completions and model discovery against one **operator-configured** base URL. The base URL is not accepted from API callers: `POST /api/v1/providers` must match `OPENAI_COMPATIBLE_BASE_URL` exactly.
- Environment secret adapters for `OPENAI_API_KEY` and `OPENAI_COMPATIBLE_API_KEY`. Values are resolved below the provider port and never stored in provider rows, audit metadata, model-call rows, logs, or responses.
- Provider connections and model registry with per-workspace RLS, immutable model-call identity, and versioned pricing snapshots.
- Hard filters for provider status, model availability, privacy classification, capabilities, context plus reserved output, known pricing, and conservative cost ceiling before scoring.
- `gpt-5-mini` profile (`gpt-5-mini-2025-08-07`): 400,000 context, 272,000 maximum input, 128,000 maximum output. Pricing revision `openai-2026-10-22`: input `$0.25/1M`, cached input `$0.025/1M`, output `$2/1M`, source [OpenAI pricing](https://developers.openai.com/api/docs/pricing).
- One operator-configured compatible profile: model, revision, context/output bounds, pricing, and capability flags come from `OPENAI_COMPATIBLE_*` environment variables. Missing pricing disables the profile instead of inventing rates. All other discovered compatible models remain unavailable.
- Conservative cost reservation includes a 25% uncertainty margin. Actual usage is reconciled once; over-ceiling actual usage marks both the model call and reservation `unknown` and does not settle.
- Circuit breaker opens after three transient failures for 60 seconds, with one half-open probe.
- Unknown discovered models are stored as `availability='unknown'` with unknown pricing/capabilities and cannot be selected for inference.
- Compatible endpoint validation requires HTTPS, a public-looking DNS hostname, no credentials/query/fragment, and a `/v1` path. Literal loopback, private IPv4, `.local`, `.internal`, and single-label hosts are rejected; redirects are disabled. DNS resolution is not independently pinned, so the endpoint remains an operator-trusted configuration value.

Public routes implemented:

- `POST /api/v1/providers`
- `GET /api/v1/providers`
- `GET /api/v1/providers/:providerId`
- `PATCH /api/v1/providers/:providerId`
- `POST /api/v1/providers/:providerId/discovery`
- `GET /api/v1/models`
- `POST /api/v1/routing/preview`

Direct inference is invoked through the internal provider service; there is no public arbitrary inference route. Stage 06 does not yet connect goal operations to model calls.

## Database

Migration `011-inference-providers.sql` creates `inference.provider_connections`, `inference.models`, and `inference.model_calls`. It extends `control.operations` with `provider.discovery`/`provider.probe`, nullable project/input references for provider-scoped operations, and bounded JSON input.

Migration `012-openai-compatible-providers.sql` adds `kind='openai_compatible'` and constrains compatible endpoints to HTTPS `/v1` bases while preserving the official OpenAI endpoint constraint. Model-call `run_id` and `task_id` remain nullable until Stage 07 supplies durable runs and tasks.

Local `asi_local` was migrated from Stage 05 through Stage 06 with encrypted pre-migration backups. Live readiness reports all twelve migrations applied and the runtime role safe.

- Migration `012` SHA-256: `1ef0e389cba008d5a5abe64b07085d6c8e85b51458617139cb8fee85027da8b0`.
- Latest encrypted pre-migration backup: `data/backups/database-1792676940795-c675b926-bb9f-49ce-b533-e9bbab4270cf.asbak`.

## Commands

```powershell
npm run db:verify -- --offline --stage06
npm run db:migrate -- --plan --stage06
npm run db:migrate -- --stage06
npm run db:verify -- --stage06
npm run test:providers
npm run provider:verify
node --env-file=.env --env-file=.env.runtime scripts/stage06-live-probe.mjs
```

`npm run provider:verify` creates a disposable PostgreSQL database and selects the official or compatible target from environment configuration. With compatible configuration it discovers real models and makes one capped Chat Completions request for the single `OPENAI_COMPATIBLE_MODEL`; with official configuration it probes `gpt-5-mini` through the Responses API. It never prints credentials.

## Acceptance evidence

| Requirement | Evidence/result |
| --- | --- |
| Stage 05 prerequisite | PASS; governance locally qualified and composed |
| Migrations 001-013 | PASS; offline checksums verified; `011` and `012` applied locally with encrypted backups; live readiness `ready` |
| Provider/model/router unit behavior | PASS; pricing, unknown pricing rejection, hard filters, privacy/context/capability/budget denial, circuit breaking, streaming, timeout, malformed output, and auth failure tested for both adapters |
| Provider PostgreSQL behavior | PASS; provider CRUD, discovery upsert, unknown-model exclusion, routing preview, capped probe, model-call persistence, usage entry, budget settlement, and over-ceiling `unknown` path tested |
| HTTP contracts | PASS; auth/CSRF, endpoint allowlist, secret-reference refusal, create `Location`, idempotent replay, pagination/list/get/404, `If-Match` 428/412, update version, and credential-unavailable discovery tested |
| Compatible endpoint live call | PASS; `npm run provider:verify` returned `STAGE06_PROVIDER_VERIFIED` for `openai_compatible free/gpt-6-luna`, request `9329e752a928afe77598c7f4f5af349c`, 317 input tokens, 7 output tokens, reconciled actual cost `0` micro-USD under a 10,000 micro-USD ceiling |
| Live revoked auth | PASS; against the real compatible endpoint, a syntactically valid but rejected key surfaced `PROVIDER_AUTH_FAILED` (502) |
| Live rate limit (429) | PASS; a burst of 20 real `generate` calls surfaced `PROVIDER_RATE_LIMITED` (429, retryable) on 15 of them; the endpoint also returned raw 429s on 55 of 60 unthrottled-transport burst checks |
| Live timeout | PASS; measured round-trip 366 ms, then a 45 ms adapter budget aborted an in-flight request with `PROVIDER_TIMEOUT` (504, retryable) |
| Official OpenAI live call | **UNVERIFIED**; official OpenAI rejected the configured credential during discovery |
| Full regression suite | PASS; 112 tests with zero failures or skips after the completion changes |

## Remaining limits and follow-ups

- Configure an accepted official OpenAI key in ignored `.env` or `.env.runtime`, then run `npm run provider:verify` with compatible variables unset; do not paste credentials into chat or commit them.
- The official OpenAI target remains live-unverified for the positive path; only the negative auth path is covered there (the configured credential is rejected at discovery).
- The installation has no qualified DPAPI provider secret-reference store. `secretReferenceId` is rejected; environment resolution is the only supported credential path.
- Only `gpt-5-mini` has a qualified official profile. The compatible endpoint has exactly one operator-configured profile; unknown models are intentionally unavailable.
- The compatible endpoint is operator-trusted, not user-selectable. DNS rebinding is not independently pinned; restrict the configured host to a provider you control or trust.
- The local operator configured an explicit zero price for the selected `free/*` model. No provider price sheet was independently verified, and this is not an assertion that all compatible models are free.
- Provider discovery records a `provider.discovery` operation; the paid probe is a separate internal service call used by verification, not a public route.
- [Stage 06 OpenAPI](api/stage06.openapi.json) is now generated from shared runtime schemas and verified by contract tests. [API contracts](05-API-CONTRACTS.md) remains normative.
- Stage 07 durable execution, effects, and goal-linked inference remain unimplemented.
