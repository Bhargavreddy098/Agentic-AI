# 0002 — Foundation review and contract completion

Date: 2026-10-06. Scope authorized by the user's request to audit completion and implement remaining work. Preserves approved architecture, stack, seven sections, inline decisions and native sequential execution.

Audit: system 01 is the only completed ledger task; system 02 has unfinished source and 118 passing tests; no UI task is implemented. The existing full verification fails because the contracts workspace has no build script. The three architecture tests cover direct imports and pins, not runtime isolation, RLS, approvals or credential safety. Production strength is not established by these tests.

Changes: give contracts an actual TypeScript build and explicit export; reject invalid calendar dates, lossy/non-JSON values and inconsistent event/principal tenancy. Replace Node-only byte counting with TextEncoder for shared browser contracts. Repair protected-file enforcement to preserve porcelain status columns, enumerate nested untracked files, and handle rename source paths. These strengthen the existing contracts and governance; no boundary or dependency substitution.

Ruling: retain existing uncommitted Task 02 work, review and complete it instead of recreating it. Original RED evidence for that code is unavailable; this session observes RED→GREEN for added regressions and independently runs the existing suite. Cost if wrong: gaps in original test coverage remain possible; public compatibility fixtures and subsequent integration gates remain required.

Ruling: keep the requested workspace and use branch implementation/workspace-ui, preserving all unfinished files. No worktree was created. Cost if wrong: another writer in the same checkout could interfere; native execution remains sequential.

Preflight: system 02 schemas are consumed by UI U02 and backend 03; fields and names preserved. U01 supplies wrappers to U04–U16; no feature imports vendor source. U03 and real U17 share U02 contracts; demo/live modes remain explicit. U19 depends on backend 01–16 and 19; mocks cannot satisfy that gate. Backend Linux infrastructure and pending model/quotas/microVM choices still gate their owning tasks.

Next sequence: complete/review 02 → U01 source/peer qualification and actual frontend build → U02 UI contracts → U03 HTTP/SSE simulator → U04–U16 UI demo → U17–U19 real integration after named backend gates. AI Elements is the approved presentation owner; shadcn owns primitives. Other catalogs remain references until individual source/license/peer/digest qualification.

No provider credentials, inference, real effects, deployment or runtime sandbox claims are added by this change.

Fresh foundation review: reviewer found public package export failure, a sparse-array/accessor serialization bypass and contradictory delegated/budget tenants. Fixed export to compiled JS/declarations, validated original descriptors before Zod transformations, and bound nested task tenancy. Added reproductions and observed RED→GREEN for JSON/tenancy. Public export failure was reproduced by reviewer, then fixed and smoke-tested in Node. No second review pass is claimed.

Ruling: TaskEnvelope tenancy remains in its existing canonical principalGrant and root budget, now constrained equal; do not add a duplicate top-level tenantId that breaks the frozen wire fixture. Cost if wrong: downstream adapters must consistently derive tenant identity from the authenticated grant; Task 03 verification remains required.

Compatibility limitation: existing snapshots freeze top-level fields and requiredness, not every nested enum/schema variant. Unit validation covers discriminated outcomes and scope rules. This evidence is not exhaustive wire compatibility or runtime authorization.
