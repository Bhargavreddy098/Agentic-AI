# Stage 05 - Policy, approvals, budgets, and audit qualification

Date: 2026-10-22. Stage 04 prerequisites are documented in [local product qualification](17-LOCAL-PRODUCT-QUALIFICATION.md). This task completes and qualifies the next roadmap dependency, Stage 05: deterministic policy evaluation, four autonomy modes, digest-bound approvals, capability grants, atomic cost reservations, usage accounting, and append-only hash-chained audit. The original product idea is unchanged.

## Implemented boundary

Normal `npm start` composes PostgreSQL, local identity, Stage 04 product services, and Stage 05 governance services (`audit`, `policies`, `grants`, `approvals`, `budgets`). Startup requires PostgreSQL/vector, verified migrations 001-010, and least-privilege runtime-role checks. Planning workflows, paid inference, execution, verification, memory, schedules, and deployment remain disabled.

The public implemented surface includes:
- **Policy:** `GET /api/v1/policies/current`, `POST /api/v1/policies/revisions`, `POST /api/v1/policies/:revisionId/activate`.
- **Grants:** `GET /api/v1/projects/:projectId/grants`, `POST /api/v1/projects/:projectId/grants`, `POST /api/v1/grants/:grantId/revoke`.
- **Approvals:** `POST /api/v1/contract-revisions/:revisionId/approval-requests`, `GET /api/v1/approvals`, `GET /api/v1/approvals/:approvalId`, `POST /api/v1/approvals/:approvalId/decisions`, `POST /api/v1/approvals/:approvalId/revoke`.
- **Budgets and usage:** `GET /api/v1/projects/:projectId/budgets`, `POST /api/v1/projects/:projectId/budgets`, `PATCH /api/v1/budgets/:budgetId`, `GET /api/v1/usage`.

The policy evaluator is deterministic and deny-overrides. It checks authenticated principal and scope, action/capability/input-digest validity, owner-only capabilities for workers, forbidden targets, egress/privacy classification, capability-rule effects, autonomy mode, sandbox qualification, grant validity, high-impact approval, and budget reservation/ceiling. An approved approval is accepted only when its digest matches the evaluated input digest. `validatePolicySafety` rejects policies that remove mandatory reservation, allow mutation in `plan_only`, remove production high-impact actions, or contain contradictory capability rules.

Owner-facing governance mutations use `executeCommand` for durable idempotency and outbox records; internal budget reservation transitions use scoped transactions, row locks, and idempotent operation keys. Policy and audit rows are append-only via database triggers. Approval state transitions are constrained to `pending -> approved|rejected|expired|revoked` and `approved -> revoked` before consumption. Approval bindings (contract revision, digest, approver, nonce hash, expiry, scope, consequence) cannot be rewritten. Budget reservations lock the project and workspace account rows, so concurrent reserves cannot overspend either ceiling.

## Database

Migration `009-planning-identities.sql` creates `product.goals` and the immutable requirement, plan, step, contract, and decision identities/revisions referenced by Stage 05 fixtures. Migration `010-governance.sql` creates `control.policy_revisions`, `control.capability_grants`, `control.approvals`, `control.budget_accounts`, `control.budget_reservations`, `ops.usage_entries`, `ops.audit_heads`, and `ops.audit_events`. Both use RLS, scoped composite foreign keys, indexes, and immutability/state-transition guards. `--stage05` restricts verification and planning to migrations 001-010.

```powershell
# Verify Stage 05 database readiness (offline and online):
npm run db:verify -- --offline --stage05
npm run db:verify -- --stage05

# Apply Stage 05 migrations with automatic encrypted pre-migration backup:
npm run db:migrate -- --stage05

# Run Stage 05 policy and governance tests:
npm run test:governance

# Full build, lint, and regression suite:
npm run build
npm run lint
npm test
```

## Acceptance evidence

| Requirement | Evidence/result |
| --- | --- |
| Stage 04 prerequisite | PASS; Stage 04 locally qualified and composed |
| Migrations 001-010 | PASS; offline checksums verified; online migration applied from the local 006 state with encrypted backup; live readiness `ready` |
| Normal startup composition | PASS; real server on loopback reported `postgres`, `vector`, `schemas`, `migrations`, and `runtimeRole` ready |
| Deterministic policy truth table | PASS; unit tests cover mode denial, sandbox denial, missing/revoked/expired grants, reservation required, budget limit/exceeded, forbidden target, egress denial, worker owner-only denial, input-digest validation, high-impact approval, approval digest mismatch, and approved/rejected/revoked/expired approval handling |
| Policy revision/activation | PASS; digest binding, stale-base rejection, single active revision, and supersession tested on PostgreSQL |
| Capability grants | PASS; project-scoped creation, expiry validation, listing, idempotent revocation, and audit tested |
| Approval binding and decisions | PASS; exact contract digest, nonce mismatch/replay, changed digest, double decision, worker decision denial, expiry, consumption/revocation conflict, and owner-only enforcement tested |
| Budget reservations | PASS; concurrent reserves race one winner, project ceiling enforced, idempotent operation key, settle-once, usage entry, and `If-Match` version checks tested |
| Append-only audit | PASS; hash chain links every event, sequence persists in `ops.audit_heads`, events are immutable, and approval nonces are absent from audit metadata |
| Security | PASS; high-impact actions require exact approval, raw nonces are not written to audit, and worker principals are denied owner-only governance capabilities |
| Test suite | PASS; full `npm test` completed 88 tests with zero failures or skips, including 9 governance integration subtests and 5 governance unit tests |

## Remaining limits and follow-ups

- Stage 06 provider routing and Stage 07 effect dispatch are not implemented. Approval consumption is represented by a durable `consumed_at` transition and is tested against revocation; actual effect dispatch remains unavailable.
- The approval request idempotency record retains the one-time nonce in its encrypted-database replay response for the same owner/key until expiry. Approval storage itself keeps only the SHA-256 nonce hash. A future credential-broker integration can move replay secrets out of the control database.
- Policy evaluation is exercised directly and through service tests; no tool/effect execution path exists yet to bypass or consume it.
- A machine-readable Stage 05 OpenAPI document was not produced in this task. The normative route and DTO contract remains [API contracts](05-API-CONTRACTS.md).

No Stage 05 blockers remain. Stage 06 (provider abstraction and first real provider) is the next roadmap dependency.
