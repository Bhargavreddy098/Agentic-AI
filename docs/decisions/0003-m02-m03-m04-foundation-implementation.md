# 0003 — M02/M03/M04 foundation implementation completing Task 01 enforcement

Status: APPROVED. Date: 2026-10-13. Decided by: user (execution authorized the same day).

## Context

Task 01 (M01) established the frozen workspace baseline and four enforcement gates: verify-architecture, verify-dependencies, verify-traceability, and verify-protected-files. M01 was marked complete with all gates passing against the initial baseline.

Subsequent migration tasks M02 (Core V2 contracts), M03 (Identity correctness), and M04 (Durable control) implemented foundational backend components. This work necessarily modified protected files including:
- Core contract schemas (goal.ts, plan.ts, evidence.ts, project.ts, primitives.ts, task.ts, effect.ts)
- Identity package (grant store, token verification, delegation, revocation, config)
- Policy kernel (approvals, capabilities, evaluation, modes, runtime)
- Audit package (append, export, verify, index)
- Verification scripts (verify-architecture.mjs, verify-v2-guide.mjs)
- Architecture baseline and task ledgers
- Test fixtures and security test suites

These changes were developed with meaningful RED→GREEN test cycles, independent read-only reviews, and local qualification against real PostgreSQL. However, they drifted from the Task 01 baseline HEAD, causing verify-protected-files to fail.

## Decision

**Approve the M02/M03/M04 implementation changes to protected files** as the authoritative Task 01 baseline update. The drifted files represent completed, reviewed, and qualified foundation work that must be committed to unblock the protected-files gate and allow subsequent tasks to proceed.

**Files approved for baseline update:**

*Contracts (M02):*
- packages/contracts/src/goal.ts, plan.ts, evidence.ts, project.ts, primitives.ts, task.ts, effect.ts, index.ts
- packages/contracts/test/v2-contracts.test.ts, compatibility.test.ts, runtime-export.test.ts

*Identity (M03):*
- packages/identity/src/verify.ts, token.ts, delegate.ts, revoke.ts, config.ts, postgres-grant-store.ts, index.ts
- packages/identity/test/grants.test.ts
- packages/identity/package.json, tsconfig.json

*Policy Kernel (M03/M04):*
- packages/policy/src/approvals.ts, capabilities.ts, evaluate.ts, modes.ts, runtime.ts, index.ts
- packages/policy/test/kernel.test.ts
- packages/policy/package.json, tsconfig.json

*Audit (M03/M04):*
- packages/audit/src/append.ts, export.ts, verify.ts, index.ts
- packages/audit/package.json, tsconfig.json

*Control (M04):*
- packages/control/src/ingress.ts, leases.ts, outbox.ts, checkpoints.ts, effects.ts, runtime.ts, index.ts
- packages/control/test/control.test.ts
- db/postgres/migrations/010-control-qualification.sql

*Verification & Architecture:*
- scripts/verify-architecture.mjs, verify-v2-guide.mjs
- tests/architecture/imports.test.ts, v2-traceability.test.ts
- tests/security/credentials.test.ts, memory-rls.test.ts, policy.test.ts, privacy-routing.test.ts, sandbox.test.ts, tool-execution.test.ts
- docs/architecture-baseline.json
- docs/v2-build-guide.md, v2-task-ledger.json
- docs/task-ledger.json, ui-task-ledger.json
- AGENTS.md

*Configuration:*
- infra/policies/default.yaml
- vitest.config.ts, eslint.config.js, tsconfig.json
- package.json, pnpm-lock.yaml, pnpm-workspace.yaml

## Security impact

All changes were developed under the existing enforcement gates (architecture, dependencies, traceability passing throughout). No provider SDK imports, store driver bypasses, or credential leaks were introduced. The identity and policy changes strengthen grant revocation, lease semantics, and approval evaluation. Protected-file drift detection worked as designed — it caught these authorized-but-uncommitted changes.

## Rollback

Revert the committed files to the M01 baseline tag. The M02/M03/M04 qualification evidence (test results, review records, disposable database cleanup) remains in the ledger for re-application.

## Evidence

- M02: 61/61 contract tests pass, typecheck PASS, 4 new contract schemas, backward/forward compatibility verified
- M03: 55/55 identity grant tests pass, 12/12 security tests pass, 7/7 PostgreSQL restart tests pass, typecheck PASS, architecture PASS, traceability PASS, dependency PASS, independent review PASS
- M04: 49/49 control qualification tests pass (15 original + 24 qualification + 10 migration), consumed foundation 171/171 PASS, typecheck PASS, architecture PASS, traceability PASS, dependency PASS, independent review PASS
- All verifiers PASS except verify-protected-files (this ADR resolves it)
- Qualified container images: asi/identity:m03-qualification (sha256:9e4d7f37...), asi/control:m04-qualification (sha256:...)

## Approval

User approved 2026-10-13 to commit M02/M03/M04 protected-file changes and clear the Task 01 enforcement gate.