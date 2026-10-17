# 0001 — Runtime, dependency baseline, and workspace enforcement

> **Current platform scope — 2026-10-15:** Build and deploy the Windows version only. Linux is allowed only as an optional VM guest for qualified isolation; standalone Linux hosts/releases are deferred. This supersedes earlier platform assumptions in this document. PostgreSQL/Redis and ordinary integration/security tests remain in the Windows work queue. Preserve required protections and tests; unsupported executable paths stay disabled. See ADR 0004.

Status: APPROVED. Date: 2026-10-06. Decided by: user (execution authorized the same day).

> Current navigation (2026-10-10): use [the consolidated guide](../v2-build-guide.md#start-here) and live dependency inventory. This ADR preserves the Oct6 baseline decision and original planning context. Its monolithic MCP SDK 1.32.1 selection was superseded by [ADR0002](0002-mcp-revision.md); official client/server/core 2.3.1 and Node bridge 2.1.1 are already implemented for Task22. Do not reinstall the superseded SDK or infer current service readiness from the historical environment notes below.

## Context

The workspace contained research and proposed planning artifacts only: no application source, package manifest, lockfile, tests, CI, or Git repository. The approved system plan (Tasks 01–30) and UI plan (U01–U22) require a reproducible workspace with frozen dependencies before any product scaffolding, and architecture enforcement that fails closed when boundaries are crossed.

## Decision

**Runtime and package manager (exact pins).** Node.js 24.19.0 (`.node-version`, `engines.node`), pnpm 12.6.0 (`packageManager` field, `engine-strict=true`), npm 12.0.2 and Git 2.49.0.windows.1 recorded as observed toolchain. TypeScript 5.9.3 strict ESM (`module: NodeNext`, `strictNullChecks`, `strictFunctionTypes`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`). Zod 4.6.5 exactly, as mandated by the system spec section 11. Vitest 5.0.3 with per-suite projects (unit, integration, security, protocols, e2e, load). ESLint 10.12.0 flat config with typescript-eslint 8.71.1, @eslint/js 10.0.1, globals 17.13.0, @types/node 24.19.1.

**Dependency governance.** `docs/dependency-inventory.json` is the single approval list: exact versions, npm registry provenance, integrity digests, licenses, peer-compatibility evidence. `.npmrc` sets `strict-peer-dependencies=true` and `auto-install-peers=false` so an unmet or mismatched peer fails installation loudly instead of being silently resolved. Range specifiers, tags, git/file/npm protocols, and range workspace protocols are rejected by `verify-dependencies.mjs` (UNPINNED_DEPENDENCY). Exact versions absent from the inventory are rejected (UNAPPROVED_DEPENDENCY). Internal workspace dependencies use only `workspace:*`.

**Planned stack (version-resolved, install deferred to owning tasks).** hono 4.13.13, @hono/node-server 2.1.3, ai 7.0.128, @ai-sdk/openai 4.0.84, @ai-sdk/anthropic 4.0.72, @modelcontextprotocol/sdk 1.32.1 (protocol target 2026-07-28), mastra 1.32.1 + @mastra/core 1.74.0, bullmq 6.3.11 + ioredis 6.0.0, next 16.3.8 + react 19.3.0 + react-dom 19.3.0 + tailwindcss 4.3.3, pg 8.23.1 + pgvector 0.3.0, better-sqlite3 13.0.3 (driver choice qualified at Task 08 against built-in node:sqlite), langfuse 3.39.2 + required peer @cfworker/json-schema 4.1.1, @opentelemetry/api 1.9.1, @opentelemetry/sdk-node 0.222.0, @opentelemetry/exporter-trace-otlp-http 0.222.0. Container references: postgres:17@sha256:3cec7eb015ba…, redis:8@sha256:6e9101032a21… (digests resolved from the registry; pull verification deferred to the Linux host).

**Architecture enforcement primitives (Task 01 deliverables).** Four verification scripts, all fail-closed with JSON reports and non-zero exits: `verify-architecture.mjs` (import-graph boundary enforcement: CHANNEL_MODEL_BYPASS, PROVIDER_SDK_BYPASS, STORE_DRIVER_BYPASS, QUEUE_PACKAGE_BYPASS, CROSS_APP_IMPORT, PACKAGE_IMPORTS_APP, CONTRACTS_INFRASTRUCTURE_IMPORT, UNMAPPED_COMPONENT_PATH, BASELINE_INCONSISTENT), `verify-dependencies.mjs`, `verify-traceability.mjs` (ledger/baseline/requirement consistency, DAG acyclicity, stage and gate coverage), `verify-protected-files.mjs` (git-drift detection on protected paths). `pnpm verify` chains lint, typecheck, build, unit tests, and all four verifiers.

**Component path mapping (R01 refinement, recorded for traceability).** The baseline's `componentPaths` maps the 12 pictured components to the plan's file structure, plus declared owners for supporting packages: contracts (pure zod schemas only), control (PostgreSQL control state/outbox relay), and supporting (telemetry, evolution, observations). Skills map to the supervisor (context assembly selects verified skills; skill scripts still execute only through the tool engine in isolation). Identity, audit, and budgets map to the policy kernel (governance infrastructure). The UI package maps to Client Surfaces. Any new `apps/*` or `packages/*` source path is a UNMAPPED_COMPONENT_PATH violation until the protected baseline is changed through an approved ADR.

**Test suite separation.** Vitest projects split unit tests from integration, security, protocols, e2e, and load suites. The latter five ship with `passWithNoTests: true` until their owning tasks create files; this is explicit and documented, not a silent mock fallback. `pnpm verify` runs only the unit project, so empty suites cannot mask a failing verification gate. Integration and security suites fail if their real infrastructure (PostgreSQL, Linux isolation) is absent.

## Alternatives considered

- npm/yarn workspaces: rejected; the approved plan specifies pnpm workspaces, and substituting the package manager requires a new ADR (R24).
- Bun: rejected; not in the approved plan, and adopting it changes the runtime baseline.
- Distributed services from day one: rejected per system spec section 5, option 2.
- Single in-process prototype: rejected per system spec section 5, option 3; it cannot satisfy out-of-process enforcement for executable tools.
- Latest-pinned dependencies: rejected; "latest" is not a version specification and defeats the frozen-install requirement.

## Security impact

Exact pins plus integrity digests plus a frozen lockfile bound the supply chain to registry artifacts inspected on 2026-10-06. Strict peer resolution prevents silent dependency injection through peer ranges. Provider SDK imports are statically confined to the privacy service, so a channel, specialist, or orchestrator file cannot silently call a model provider. Store drivers are confined to declared store owners, so credentials cannot migrate into untrusted components. Protected-file drift detection makes unauthorized changes to policy, signing, contracts, architecture tests, and evaluation goldens visible as a failed verification gate.

## Rollback

Remove the workspace files and `pnpm-lock.yaml`; no deployed system exists, so there is no production rollback. Reverting this ADR removes the enforcement scripts and returns the workspace to its pre-Task-01 research state; the original research assets are untouched by this decision.

## Evidence

- Registry queries on 2026-10-06: versions, licenses, integrity digests, and peer dependency ranges recorded in `docs/dependency-inventory.json`.
- Engine compatibility: vitest 5.0.3 (^22.12.0 || ^24.0.0 || >=26.0.0), eslint 10.12.0 (^20.19.0 || ^22.13.0 || >=24), typescript-eslint 8.71.1 (eslint ^8.57.0 || ^9.0.0 || ^10.0.0; typescript >=4.8.4 <6.1.0) — all satisfied by node 24.19.0 with the frozen pins.
- Peer compatibility: zod 4.6.5 satisfies ai/@ai-sdk/* (^3.25.76 || ^4.1.8) and @mastra/core (^3.25.0 || ^4.0.0); @mastra/core 1.74.0 satisfies mastra 1.32.1 (>=1.58.0-0 <2.0.0-0); react/react-dom 19.3.0 satisfy next 16.3.8.
- Environment: Docker CLI 29.4.3 present, daemon NOT running (blocks sandbox qualification, Tasks 12+); WSL present (docker-desktop distribution, version 2), not yet qualified; platform win32 — unit, typecheck, and lint work runs here, security/integration/release checks run on the qualified Linux host.

## Pending decisions (recorded, with blocking points)

- First real product tasks (blocks the Task 10 evaluation corpus).
- Model/data policy detail (blocks Task 11 credentials and any real data).
- Spend and retention quotas in integer micro-USD (blocks first real inference and release).
- MicroVM backend selection (blocks Tasks 12 and 27 generated/untrusted execution).

## Approved the same day

Spec (R01–R24), system plan (01–30), UI spec (F01–F18), and UI plan (U01–U22) approved as proposed. Execution method: native sequential. Build order: interleave UI early — system 01–02, then U01–U03, backend 03–16 while UI U04–U16 proceeds, real integration U17–U19 after system 01–16 and 19 pass. Primary UI presentation: AI Elements. Deployment: single-tenant Linux host, Windows development workstation.
