---
title: "Identity security and credentials implementation guide"
status: "PROPOSED DESIGN"
implementation: "NOT IMPLEMENTED HERE"
verification: "NOT RUN"
feature_id: "F02"
updated: "2026-11-05"
---

# Identity security and credentials implementation guide

## Order and prerequisites

Primary phase IP02. Read [contracts](contracts.md), [mechanism](credential-lifecycle.md), direct peers ([sessions](../sessions/index.md), [desktop](../desktop/index.md)) and current [gates](../governance/decisions.md). Source code is not present in this documentation project; resolve source ownership when implementing rather than creating files to imitate another repository.

| Task | Required result | Completion condition |
|---|---|---|
| F02-C | Exact operation contract, state transitions, schema delta and failure policy | Reviewed caller/owner boundary; no unresolved contract decision for that operation |
| F02-B | Qualify trusted IPC, DPAPI availability, secret references, revocation and backend credential resolution | Reject forged IPC, unavailable encryption and revoked references; scan renderer/log artifacts for secret canaries. |
| F02-U | Wire actual UI/CLI consumer through the same owner | Real pending/result/error states; no fabricated data or renderer authority |
| F02-V | Exercise real integration and negative/recovery scenarios | Required acceptance evidence exists; missing evidence remains UNKNOWN |

Split these per bounded operation; C -> B -> U -> V is a task pattern, not permission for one agent to rebuild the entire domain at once. Each concrete task names exact files, prerequisites, tests and rollback before code.

## Implementation requirements

Electron main accepts one-time credential input through trusted IPC, encrypts with safeStorage and stores an opaque reference. Provider resolution occurs inside trusted processes. Rotation creates a new credential revision; in-flight behavior is explicit and revocation blocks new dispatch.

Use TypeScript for new logic. Reuse existing domain owners during integration. Parameterize SQL, preserve public contracts and current UI design. Keep new dependencies tied to actual consumers and qualification, not installed-only milestones.

## Rollback

Stop new admission, retain completed and uncertain effects, and revert compatible source/UI changes. Never erase evidence or re-enable an unsafe fallback. Migrations and external-effect rollback require separately reviewed procedures. Preserve original databases through any conversion.
