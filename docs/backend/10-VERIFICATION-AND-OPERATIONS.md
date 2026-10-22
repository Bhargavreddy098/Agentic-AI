# Verification, evaluation, cost, and operations

## Completion is a computed result

A goal may be achieved only when all required acceptance criteria for its approved requirement revision pass against the exact final artifact, with current evidence from the required environment. Missing, skipped, stale, mismatched or untrusted evidence is `unknown`, not pass. Optional failures remain visible. Unresolved external effects prevent a clean completion declaration.

Verification records bind criterion ID, contract/requirement revision, artifact digest, repository snapshot, suite version, verifier identity, tool/image versions, environment digest, start/end timestamps, exit status, parsed result and evidence artifact IDs. The report is immutable. A new patch produces a new artifact and invalidates affected results; safe reuse needs explicit dependency evidence.

## Independent verification design

The producer can supply candidate tests and logs, but the verifier owns the required suite and evaluates the resulting bytes in a fresh qualified workspace. Do not let the producer change required flags, skip patterns, assertions or thresholds. Model judgment can supplement product/design review; deterministic checks govern structural claims wherever possible. Independence is architectural separation of authority and evidence, not necessarily a different vendor for every call.

| Criterion class | Evidence | Required failure behavior |
| --- | --- | --- |
| Build/type correctness | Exact command, source digest, exit code and output | Nonzero or missing output fails/unknown |
| API functionality | Contract tests against running generated application | Schema/auth/error mismatch fails |
| Database integrity | Migration and invariant tests on disposable real PostgreSQL | Constraint/scope failure blocks |
| User flow | E2E interaction evidence through real application | Synthetic response fixture cannot establish end-to-end success |
| Security | Injection, authorization, replay, path/egress tests | Any critical boundary violation blocks release |
| Accessibility | Automated scan plus named manual/rubric checks | Unknown manual review remains visible |
| Performance | Reproducible load profile and hardware/environment | Compare measured percentiles with approved target |
| Visual/product quality | Screenshots, task-flow rubric and reviewer result | Do not substitute aesthetics for functional acceptance |
| Deployment | External release ID, target health and functional probes | Running process alone does not prove deployment correctness |
| Research | Fresh primary sources supporting concrete claims | Missing/contradictory source means unknown |

## Product Quality Review

For generated user-facing applications, review hierarchy, navigation, usability, responsive behavior, accessibility, empty/loading/error states, onboarding, interaction consistency and user-goal completion. The frontend of ASI itself is outside this documentation task, but verifying generated frontends remains part of the product vision.

Each rubric item records expected behavior, observation, screenshot/trace, severity and pass/fail/unknown. Critical flow failures block completion; minor polish issues can be reported as accepted limitations only if the contract permits them. A screenshot looking plausible never substitutes for a completed checkout or authenticated workflow.

## Backend release test matrix

| Suite | Essential scenarios | Environment |
| --- | --- | --- |
| Unit | Policy truth table, four autonomy modes, state transitions, budget arithmetic, DAG cycles, canonical digests | Deterministic clock and synthetic data |
| API contract | All routes parse strict DTOs, safe errors, scope checks, ETags and replay | Real Express server |
| Database integration | Composite FKs, RLS, transaction rollback, pool reuse, CAS and concurrent budget locks | Disposable real PostgreSQL with actual pgvector |
| Worker conformance | Auth, fenced lease, cancellation, out-of-scope writes, false success, malformed receipts | Qualified guest and selected coding adapter |
| Fault injection | Kill before/after each effect boundary; provider timeout after success; host restart | Separate processes with durable database |
| Security | Session/CSRF/rebinding, malicious repo, SSRF, secret canaries, archive/path attacks | Host/guest boundary under realistic restrictions |
| Retrieval | Exact/ANN recall, filters, correction, expiry, deletion, space migration | Representative scoped corpus |
| Scheduling | DST gaps/folds, sleep, overlap, duplicate webhook, revoked grant | Controlled clock plus restart tests |
| Acceptance | Idea → approved plan → artifact → independent verification; changed contract; exhausted budget | One real provider and one real worker |
| Operations | Install/update/rollback, backup/restore, disk pressure, corrupt artifacts, graceful shutdown | Fresh supported Windows machine |

Do not claim a suite passed because tests exist. Store command, commit, environment, counts, failures/skips and evidence digests. Mocked unit tests cannot qualify database isolation or VM security. Freeze acceptance fixtures before measuring a new agent revision.

## Intelligence evaluation framework

| Capability | Frozen task suite | Metrics |
| --- | --- | --- |
| Intent/requirements | Vague product briefs with expert-labeled material questions | Must-have recall, unsupported assumptions, unnecessary question count |
| Architecture | Constrained system briefs with competing alternatives | Constraint satisfaction, justified complexity, risks found |
| Planning | Dependency-rich builds and existing-repo changes | DAG validity, coverage, executable leaf tasks, estimate error |
| Coding | Small applications and seeded bugs in fixed repositories | Independent acceptance pass rate, regression count |
| Debugging | Known fault classes with protected tests | Repair success, repeated ineffective patches, cost per fix |
| Tool use | Allowed/denied/ambiguous actions and malicious content | Unauthorized effects (must be zero), correct refusal/escalation |
| Memory/context | Queries with stale/conflicting/scoped documents | Recall/precision, citation correctness, leakage rate |
| Verification | Deliberately incorrect artifacts with plausible success claims | False acceptance rate, missed defect rate |
| Long-run reliability | Restarts, outages, stale workers, uncertain effects | Lost tasks, duplicate effects, recovery time |
| Cost efficiency | Same task/model/policy cohorts | Verified outcomes per cost, latency and budget overrun |

Run repeated stochastic trials and report sample size, variability and confidence intervals when comparing model outcomes. Keep development cases separate from held-out release cases. Track human rubric disagreement. Candidate prompt/router changes require reviewed evidence and rollback; do not optimize only for self-reported success.

## Initial measurable targets

These are proposed acceptance targets, to be adjusted with product-owner constraints and measured hardware; none are current performance claims.

- Zero unauthorized mutations, cross-scope disclosures, approval replays or duplicate high-impact effects in deterministic release fixtures.
- No accepted durable command lost across forced process restart; replayed commands return the same logical operation.
- At least 95% of retry-safe interrupted tasks recover automatically in a documented fault-injection suite; ambiguous effects remain safely blocked.
- Metadata API p95 under 250 ms at 20 concurrent local clients on a stated reference machine, excluding model calls and large uploads.
- Durable event visible to an active local SSE client within two seconds p95 after commit; reconnect yields no missing retained events.
- Cancellation stops new dispatch immediately after durable request and terminates owned guest work within a measured 15-second grace target; external non-cancellable work is reconciled.
- First killer-workflow benchmark: at least 8 of 10 fixed small-app briefs meet all required criteria within their approved budgets over a recorded trial. Failed cases must have honest evidence, not invented completion.
- Restore succeeds on a fresh machine/account using the documented key-recovery procedure; measured RPO/RTO matches the selected backup tier.

## Cost accounting

Categories: inference input/output/cache tokens, embeddings, coding worker usage, external APIs, browser services, guest/build compute, storage, databases and cloud infrastructure. A provider subscription with unknown per-task monetary allocation still consumes a configured usage/concurrency/time budget; do not report it as zero-cost certainty.

Before dispatch, reserve `estimatedInput * inputPrice + maximumOutput * outputPrice + fixedCosts + uncertaintyMargin` using a versioned price snapshot. Hold reservations across project/run/workspace ceilings in a single transaction. Enforce token/output/deadline/concurrency limits in adapters. A hard financial ceiling is only as strong as the provider's billing/cancellation guarantees; exclude operations with unbounded external exposure or require a provider-side cap.

Usage records distinguish estimated, reported and reconciled amounts. Unknown usage remains reserved. Duplicate receipts use stable operation IDs. Price changes affect new estimates; historical entries preserve the applied price revision. Budget warnings at 80% and 95% are initial configurable thresholds; a hard limit blocks new dispatch. Never increase limits automatically to finish a run.

## Observability contract

Propagate `traceId`, `requestId`, `causationId`, `workspaceId`, `projectId`, `conversationId`, `goalId`, `contractRevisionId`, `planRevisionId`, `runId`, `taskId`, `agentSessionId`, `modelCallId`, `effectId`, `artifactId`, and `verificationJobId` as applicable. Persist identifiers on durable records so traces remain understandable after collector outages.

Log allowlisted metadata: action, state transition, duration, safe error code, provider/model ID, token counts, cost, digest and result status. Default logs exclude prompts, source code, cookies, authorization headers, raw URLs with queries, secrets and tool stdout. Sensitive evidence lives in access-controlled artifact storage with explicit retention.

Metrics: queue age/depth, lease expiration, uncertain effects, outbox lag, approval wait, provider latency/error/throttle, budget reservations, verification outcomes, retrieval recall snapshots, disk/quarantine size and restore age. Keep high-cardinality IDs in traces/logs rather than metric labels. Telemetry exporter failure must not silently stop workflow state commits; bounded local buffering and dropped telemetry counters make it visible.

## Runbooks

**Database unavailable:** readiness false; reject new durable mutations; stop claims/effects; retain existing unknown outcomes; retry connection with backoff; on return reconcile leases/outbox before resuming. Never switch to memory-only storage.

**Provider outage:** open circuit breaker; keep privacy/capability filters; use an eligible approved fallback within budget or block. Preserve partial output and usage uncertainty.

**Worker compromise or sandbox breach:** revoke connection/grants, stop guest, quarantine outputs, disable adapter, preserve minimal evidence, rotate exposed credentials with owner authorization, and rerun qualification before enabling.

**Disk pressure:** stop accepting uploads at low-water threshold; block new execution before space exhaustion; expire safe temporary files by explicit retention; do not delete evidence still referenced by contracts/backups.

**Unknown external effect:** inspect stored operation identity/receipt, query provider read-only state, reconcile if evidence establishes result, otherwise ask owner to resolve the specific action. Never reissue a purchase or publish request blindly.

**Corrupt artifact:** mark unavailable/quarantined, invalidate dependent verification, recover by digest from backup or rebuild through an approved run. A matching filename is insufficient.

**Migration failure:** transaction rollback where possible; preserve journal/checksum; verify partial nontransactional operations; restore or forward-fix using rehearsed plan. Do not edit old checksums to suppress errors.

**Restore:** stop dispatch; restore database and matching blob inventory; recover secret access separately; verify hashes/FKs/approvals; invalidate expired tokens/leases; reconcile unknown external effects before reopening execution.

## Windows release qualification

Document supported Windows edition/build, virtualization requirements, CPU/RAM/disk target, PostgreSQL/vector installation, user identity, artifact/secret ACLs, port behavior, auto-start choice, crash restart and update rollback. Default installation runs as the local user. A service account release is a separate tested profile because filesystem/DPAPI permissions differ.

Release evidence bundle includes dependency versions/SBOM, test results, database migration checksums, VM image digest, supported adapters, capability limitations, backup/restore report, performance profile and known issues. New release activates only after compatibility checks; old worker capabilities expire. Nothing in this documentation task establishes that release qualification has passed.
