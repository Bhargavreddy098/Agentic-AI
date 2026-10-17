# ADR 0004: Windows-only current release with optional isolation VMs

Date: 2026-10-15 (Asia/Calcutta). Status: approved platform scope, directly requested by the human.

## Decision

Windows is the only current development and deployment target; Linux is permitted only inside a VM when required for qualified isolation. Standalone Linux deployment and native Linux release-host qualification are deferred. This supersedes the deployment assumptions in ADR 0001 and the original/V2 plans for the current release. Keep the 12 components, seven UI sections, existing wire contracts, stores and security boundaries. Backend-first execution remains.

## What agents must build

- Build, launch, integrate and release the application on Windows. Native Linux installation, systemd packaging, standalone Linux servers and Linux release-host conformance are outside the current release.
- Run PostgreSQL identity/control/audit/budget/policy/memory tests with real disposable qualification databases and restricted runtime roles on Windows or VM-hosted services. Missing M03/M04 databases and B06/B07 environment variables are setup work, not a Linux OS requirement. KVM is not required for database qualification.
- Keep Redis/BullMQ, SQLite, authenticated Gateway, provider routing and the frontend in the Windows build path. SQLite uses owner-exclusive local Windows storage or local guest storage; never share live WAL files across network/sync folders or host/guest processes.
- Task12 selects and qualifies actual isolation reachable from Windows. A Linux guest is permitted only inside an optional VM, including a selected VM-backed container runtime. This decision does not select Hyper-V, WSL2, QEMU, Firecracker or any new backend or promise hardware support. Record backend choice and verify capabilities in Task12.
- Reviewed executable tools require qualified isolation. Generated/untrusted handlers retain the qualified VM/microVM boundary. No host subprocess/worker_threads or mocked backend substitutes for isolation. If the selected backend is unavailable, deny affected execution and retain its pending qualification.
- Tasks13/18/22/23/24 and V2 agents consume the qualified Windows-hosted ports. Tasks25/30 target Windows service lifecycle, permissions, TLS, private networking, secrets, durable data, backup/restore, retention, update/rollback, load and handoff. Tasks27/29 retain their isolated candidate and independent evaluation obligations inside an optional qualified VM.
- UI tasks run against the Windows Gateway. Preserve live/simulated separation and existing approval, cancellation, replay, accessibility and security tests.

## Qualification and migration of plans

All 30 backend, 22 UI and 52 V2 task cards carry the same execution target. IDs, dependencies, historical completion/evidence and acceptance assertions are retained. Earlier Linux test receipts remain historical evidence for their named environment; they do not qualify a native Windows adapter. Earlier prose requiring a standalone Linux host is superseded only as a platform prerequisite, not as proof that unresolved owner defects or tests are fixed.

Existing Linux-oriented source adapters, image scripts and credential tests remain present as optional VM implementations/history. Their Windows orchestration or native replacement belongs to their owning tasks. This documentation update neither ports runtime code nor deploys services, installs a VM, applies migrations or changes test assertions. No qualification is newly passed and no unfinished task is marked complete.

## Documentation validation

All 104 ledger cards and task briefs have a Windows execution target (30 backend, 22 UI, 52 V2). Guide/source-archive validation, traceability, architecture and dependency verification pass with zero violations. Original task statuses, evidence arrays and dependencies were preserved. No product/runtime files or test assertions changed.

Navigator tests currently pass10/12. The two failures require Task05 to depend on M04, but the pre-existing inheritedExecutionGates has no05 entry. The same two failures reproduce with all new platform metadata removed in memory. This unrelated prerequisite drift remains recorded for the navigator owner; it is not hidden by weakening tests or by the Windows scope change.

## Human clarification: active implementation is Windows only

The human requested removal of Linux-specific implementations, then clarified that Linux may be used only when genuinely mandatory for a specific VM feature. Ordinary Windows implementation must not wait for Linux. Linux backends/images/deployment scripts are removed from the current implementation; any future Linux guest backend is a separately scoped VM feature, not a default product/service prerequisite.

Removed the container and microVM execution implementations and Dockerfiles/Compose/profiles/entrypoint. The sandbox now exposes an honest Windows-unavailable boundary, denies all executable effects, and cannot qualify an empty or disabled backend. Native identity restart checks retain actual PostgreSQL/revocation/process assertions without a database container. Native credential checks establish issuance refusal without bootstrap; they do not replace filesystem/ACL isolation qualification. Historical Linux mount/image receipts remain history only. Task12 still owns native Windows isolation implementation; missing Windows protections are real task work, not a Linux host blocker.

Validation: new denial regression failed2/2 before removal, then passed2/2; Windows sandbox/credential security checks passed13/13; native PostgreSQL identity/restart checks passed7/7 using a runner-created disposable local database and restricted role, with database cleanup. Root TypeScript and strict lint passed. Build/unit verification is recorded separately after completion. No native ACL, VM or generated-code isolation is newly qualified.

Final executed checks after removal: full workspace build PASS; full unit536/536 in33suites,0skips; strict lint/typecheck PASS; architecture252files/0violations; dependencies32manifests/0violations; guide/traceability PASS. Protected-file check reports9 uncommitted entries, including existing unrelated architecture-scanner work. No blanket commit or protection bypass was performed. Earlier navigator10/12 failures remain documented.
