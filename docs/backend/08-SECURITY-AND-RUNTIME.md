# Security, Windows execution, tools, browser and deployment

## Trust boundaries

Trusted: authenticated local owner, reviewed control-plane binaries, policy evaluator, database access layer, execution broker, secret resolver and verifier policy. Untrusted: model responses, user-supplied repositories, generated programs, tool output, browser pages, retrieved documents, remote workers until authenticated, and external coding-agent completion claims.

The local Windows administrator can ultimately access or alter the host; the platform does not promise protection from a fully compromised host administrator. It must still prevent ordinary models, workers, webpages and other local web origins from obtaining that authority.

## Local identity and network surface

Bind Express to loopback by default. Validate Host and exact allowed Origin to resist DNS rebinding and cross-site requests. CORS is not authentication. Bootstrap an opaque local session through a one-time launcher challenge delivered via a Windows ACL-protected pipe/file; do not print the challenge into shared logs. Store a hash of the session token, rotate on bootstrap, revoke on sign-out, and expire idle/absolute sessions. Use HttpOnly and SameSite cookies; use Secure when HTTPS is configured. Cookie-authenticated mutations require CSRF validation.

Native clients may use a separate short-lived audience-bound token; browser cookies and worker credentials are distinct. Runtime service credentials never appear in browser payloads. Future cloud identity can replace local bootstrap behind `IdentityPort`; project scope and capability checks stay intact. Do not build organizations, invitations, custom RBAC, or billing before product need.

## Deterministic policy evaluation

Input: authenticated principal, project/run/task, immutable contract, action/tool revision, normalized input digest, resource scope, current policy, autonomy mode, approval state, privacy classification, budget reservation and sandbox qualification. Output: `allow`, `deny`, or `requires_approval`, with reason codes and constraints.

Evaluate in order: identity/scope → tool qualification → input validity → forbidden targets → privacy/egress → autonomy → sensitive-action approval → budget → execution boundary. Deny overrides allow. A model can request a policy change but cannot activate it. Re-evaluate at dispatch, because grants, approval or sandbox health may have changed since planning.

An approved action token binds audience, principal, run/task epochs, effect ID, tool revision, input digest, resource scope, maximum cost, expiry and nonce. Tokens are short-lived and delivered over authenticated broker channels. Exact-byte inputs and actual target are checked again where the effect occurs. Keep token-signing keys in the secret broker, not prompts.

## Permission ladder

| Level | Allowed purpose | Enforcement |
| --- | --- | --- |
| Workspace read | Inspect authorized repo snapshots | Broker canonical path and ACL checks; deny credentials and platform state |
| Workspace write | Apply approved patches to isolated project copy | Scoped mount/copy, digest preconditions, path containment, quotas |
| Development shell | Run dependency/build/test commands | Qualified VM guest, bounded process tree and resources |
| Isolated browser | Research/test approved URLs | Guest network policy, per-run browser context, session separation |
| External service | Invoke typed API action | Per-effect capability, approved host/method/target, secret resolution |
| Production effect | Deploy/modify important external resources | Exact action preview and separate explicit approval, reconciliation |

No runtime can promote itself to the next level. “Full autonomous build” selects a policy mode; it does not disable this ladder.

## Windows sandbox decision and experiment

Selected direction: Windows-hosted Hyper-V-backed disposable guest for generated/untrusted execution, controlled by a narrow trusted broker. Windows Sandbox is a candidate for disposable Windows workload experiments; unattended lifecycle, guest communication, limits, artifact export and restart behavior must be demonstrated before choosing it as the production backend. Microsoft documents Windows Sandbox as a hypervisor-isolated environment. [Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/).

WSL2 or Docker Desktop may supply a guest/container toolchain, but neither receives blanket approval as a hostile-code boundary. Containers share a kernel within their VM; exposed Docker socket, writable host mounts or broad integration can defeat isolation. Job Objects, restricted tokens and ACLs help trusted host helpers but are not sufficient alone for arbitrary generated code.

Qualification experiment must demonstrate:

1. Fresh guest from a pinned verified image; no host home, `.ssh`, `.aws`, `.codex`, browser profile, clipboard, or control-plane database mounts.
2. Input snapshot transferred with a manifest; output export stages bytes for quarantine and hash verification. No arbitrary host path in worker output is trusted.
3. CPU, memory, wall-clock, disk and process-tree limits; terminate the whole owned guest when cancellation/grace expires.
4. Default-deny guest egress; approved domains through controlled proxy where needed; block metadata endpoints, private networks, loopback escape, DNS rebinding and redirects to denied hosts.
5. No long-lived provider/cloud keys inside the guest. Preferred provider gateway resolves credentials outside; if an adapter requires scoped credentials inside, document the exposure, minimize scope/lifetime and block unsupported isolation modes.
6. Test junction/symlink traversal, drive-letter and UNC paths, device paths, alternate data streams, case normalization, archive traversal, zip bombs and fork/process bombs.
7. Host reboot, sleep, guest crash, broker restart, output flood and disk exhaustion leave durable records and no orphan authority.
8. Run on the actual supported Windows editions/hardware. Missing virtualization prerequisites means plan-only capabilities remain available; executable tools remain denied.

Acceptance is evidence from adversarial tests, not the existence of a Dockerfile or VM checkbox. Initial target isolation profile: one task workspace per run, one writer, explicit writable paths, no public inbound ports, no production credentials, output quota and read-only base image.

## Tool manifest and invocation contract

Each tool revision declares: stable ID/name/version, input and output schemas, capability list, risk class (`read`, `workspace_mutation`, `external_mutation`, `high_impact`), resource resolver, timeout, max output, idempotency strategy, retry classes, cancellation method, sandbox profile, egress needs, audit fields, secret-reference slots and receipt schema.

Validate nested values, enums, lengths and forbidden extra fields, not only presence of top-level keys. Normalize paths/URLs before computing authorization and input digests. The broker resolves logical workspace references to real canonical handles and checks containment again at execution to reduce TOCTOU risk. Do not execute model-built command strings on the host; use argument arrays and fixed wrappers inside the guest. Shell mode, when genuinely needed, is itself a privileged guest capability.

Tool registry updates are reviewed configuration changes. MCP transports tool discovery/calls; MCP availability does not prove a server or tool is safe. Freeze qualified manifests for an approved run, reject silent tool-definition changes, and constrain remote server origins/auth. External worker messages and tools cannot request unrestricted “admin” grants.

## Secret architecture

Flow: secret reference → trusted resolver → exact authorized provider/tool request. Store user secrets in a Windows secret adapter using user-bound DPAPI protection plus restrictive ACLs, or a qualified OS credential store. DPAPI normally binds decryption to the user's logon credentials and machine context; choose flags deliberately and test actual service identity. [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).

No raw key in PostgreSQL business records, LLM context, vector chunks, logs, generated code, ordinary artifacts, process arguments or crash diagnostics. Avoid blanket environment inheritance. Redaction is defense in depth, not the primary boundary. Rotate by creating a new secret version/reference, swapping the binding, revoking the old version and invalidating dependent sessions. Critical rotation requires explicit owner approval.

DPAPI is not portable key escrow. Plan an explicit encrypted export/recovery mechanism if cross-machine restore is required, with the recovery secret controlled by the owner. Changing to a Windows service account requires re-provisioning accessible secrets under that identity; never solve it by widening ACLs to Everyone.

## Browser and computer use

Use Playwright in the qualified guest with a separate browser context per run/account. Contexts isolate cookies/storage but are not an OS security boundary. [Playwright isolation](https://playwright.dev/docs/browser-contexts). Prefer DOM/semantic selectors; use visual reasoning only where necessary and preserve the observed screenshot/DOM/action evidence.

Public research, unauthenticated application QA, and authenticated administrative actions use distinct profiles. Encrypt session state and keep it out of embeddings and ordinary logs. Mask sensitive screenshot regions where feasible and label all screenshots for retention. Downloads enter quarantine; never auto-open executables on host. Block access to local control-plane pages and metadata services.

Before a material submit, record target origin, account reference, exact fields/action digest, expected outcome and required approval. If connection breaks after submit, inspect account/resource state rather than click again. Purchases, sending messages, creating paid services, production configuration and public publishing remain high-impact actions even when performed through a browser.

General desktop control is deferred: it needs per-application scope, input/clipboard controls, safe screen recording, interruption semantics, credential boundaries and observed-action verification. Do not infer supported computer control from browser automation working.

## Prompt injection and data exfiltration

- Tag repository/docs/web/tool material as untrusted data in context bundles; quote it as evidence, not system instructions.
- Prevent retrieved text from modifying tool registry, approvals, model routing privacy policy or budget limits.
- Require typed tool proposals followed by trusted authorization; a prompt asking to ignore instructions has no direct execution path.
- Filter outbound request destination and payload classification at the gateway. Re-check DNS resolution and redirects; disallow arbitrary endpoint configuration without owner authorization.
- Deny secret files and platform metadata during repository indexing. Secret scans supplement allowlists; scanners alone cannot prove absence of all secrets.
- Cap content size, decompression ratio, token contribution and nested references to prevent resource exhaustion.
- Red-team with malicious README instructions, fake “owner approvals,” poisoned memories, tool result commands and hostile web pages. Measure leakage/unauthorized effect rate, not just model refusal wording.

## Artifact integrity and independent execution

Store large bytes under a content-addressed opaque key, not a user-supplied path. Verify expected size and digest, scan according to type, then atomically mark available. Serve downloads with safe filenames and Content-Disposition; do not execute active HTML on the API origin. File names are metadata, never filesystem authority. A patch must apply against its declared base tree; conflicting local/user changes stop application.

Verifier runs use a clean workspace and separate identity/capability from the producer. The worker can propose tests but cannot edit the protected acceptance suite or its required flags. Artifacts carry producer identity, tool/image version, inputs, source snapshot and timestamps. Signatures authenticate receipts but do not prove the program is correct; checks still run.

## Deployment protocol

Preview includes exact artifact digest, target account/environment, infrastructure changes, migration plan, environment-variable names, secret references, expected costs, public exposure, health checks, rollback limits and input digest. Approval binds all of it and expires. Preflight is read-only unless a separate capability permits a change.

Execution acquires deployment lease, rechecks target/approval, invokes adapter with stable effect identity, captures external release ID, runs health/functional checks, and records outcome. Unknown outcome enters reconciliation. Rollback is a new effect with its own authorization unless the approved deployment explicitly includes a bounded automatic rollback plan. Destructive data migrations may be irreversible; never promise rollback from an application image alone.

## Threat-to-test matrix

| Threat | Required control | Release test |
| --- | --- | --- |
| Agent impersonates owner | Separate identities; human-only decision route | Worker token rejected for approval |
| Approval replay | Nonce, digest, expiry, atomic consumption | Concurrent identical/different effects |
| Cross-project access | Composite FKs, application scope, RLS | Guessed UUIDs and pooled connection reuse |
| Host escape/path abuse | VM and broker canonical-path checks | Junction, UNC, device path, archive traversal |
| Credential theft | Secret broker and no host secrets in guest | Canary secrets never appear in artifacts/network |
| SSRF | Typed destinations, DNS/redirect validation | Metadata/private IPv4/IPv6/rebinding fixtures |
| Supply-chain attacks | Pin/review packages; guest install | Malicious install script remains isolated |
| Browser attack | Separate context/guest and action approvals | Hostile page cannot invoke local API |
| Cost denial of service | Reservations/concurrency/output limits | Parallel calls cannot bypass ceilings |
| Evidence forgery | Digest binding and independent checks | Swapped artifact invalidates result |

## Native gateway browser handoff (owner-requested, 2026-10-24)

The local gateway launcher may consume the existing single-use challenge directly within the trusted native process and deliver the resulting session through a single-use 256-bit temporary loopback handoff URL. No browser endpoint issues fresh owner proofs. The handoff must enforce exact loopback Host/Origin restrictions, bounded expiry, atomic single-use consumption, HttpOnly SameSite cookie scope, no-store/no-referrer and listener cleanup. Challenge, nonce, ticket and session token must not enter logs or frontend configuration. Canonical session, CSRF and authorization checks remain unchanged. See [gateway qualification](26-LOCAL-GATEWAY-QUALIFICATION.md).
