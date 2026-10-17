# Identity runbook — V2 foundation M03

> **Current platform scope — 2026-10-15:** Build and deploy the Windows version only. Linux is allowed only as an optional VM guest for qualified isolation; standalone Linux hosts/releases are deferred. This supersedes earlier platform assumptions in this document. PostgreSQL/Redis and ordinary integration/security tests remain in the Windows work queue. Preserve required protections and tests; unsupported executable paths stay disabled. See ADR 0004.

`@asi/identity` is a trusted library for issuing, verifying, reducing and revoking authorization. The qualification image imports the library; it does not supply an HTTP service. Keep signing configuration and the PostgreSQL connection in the trusted governance process. Workers receive bounded tokens and public Principal claims, never keys, database handles or provider credentials.

## Durable bootstrap

1. Apply reviewed prerequisite `db/postgres/migrations/001-control.sql`, then forward migration `009-identity-grants.sql` through the trusted schema owner. Never edit an applied 001. Production migration journaling/runner qualification belongs to M04; M03 applies this closure only to a disposable qualification schema.
2. Create the tenant through the existing trusted owner. Configure a dedicated identity runtime role with schema USAGE and SELECT/INSERT/UPDATE on `identity_grants`. Give it no schema ownership, DDL, TRUNCATE, worker-accessible connection or superuser privileges. The trigger denies physical DELETE and prevents claim mutation, clearing revocation and reversing deletion. Workers receive no table privileges.
3. Obtain signing keys and a connected PostgreSQL client through trusted bootstrap. The injected client exposes parameterized `query(text, values)`; the service owner bounds connection/query timeouts and cancellation. The existing qualified control pg driver satisfies this interface; identity adds no driver dependency.
4. Call `configureIdentity({ keys: trustedKeys, defaultKid: trustedDefaultKid })` and `setGrantStore(new PostgresGrantStore(trustedDatabaseClient))` before serving authorization. Import these functions/classes from `@asi/identity`.

These are trusted bootstrap values, never task fields. The library implements no environment reader. A service may resolve `IDENTITY_SIGNING_KEYS_JSON` privately; adding it to the worker environment is rejected by the qualification profile. Missing configuration, unknown grants and database failure deny authorization. There is no automatic memory fallback. Unit tests explicitly choose `createMemoryGrantStore()`.

## Issuance and verification

Only the trusted policy/governance owner calls `createPrincipalToken(principal)` after its own authorization checks. This port is not an untrusted request handler. Issuance validates the Principal, bounds expiry by the signing key and persists immutable authority before returning the token. Failed writes return no token. An interrupted response may leave an unused grant; M03 does not claim exactly-once issuance.

`verifyPrincipal(token, expectedAudience)` validates JWT header/payload schemas, HS256 signature, issuer `asi-identity`, audience, current key validity and token times. A live canonical grant must match tenant, subject, roles, optional agentId, capabilities, audience, issuance, expiry and parent. Returned roles/agentId preserve the authenticated identity.

Grant issuance/expiry and JWT times use integer Unix **seconds**. Key creation/expiry and revocation use Unix **milliseconds**. Consumers verify at each authorization point; a cached Principal is not permanent permission.

## Delegation and revocation

Call `delegatePrincipal(parent, capabilities, audience, expiresAt)` with the original object returned by verification, or the unchanged original object successfully passed to trusted issuance in the same process/store context. Constructed, serialized, cloned or edited Principals have no delegation authority. After reconnect or restart, verify the parent token again to establish a new binding.

The child keeps its parent's tenant, receives a capability subset and cannot outlive its parent. Persistent parentGrantId connects the chain. Verification walks at most **16 ancestor links** and denies unknown, expired, future, revoked, cyclic, over-depth or widened ancestry. Descendants cannot regain permission after parent revocation.

`revokeGrant(grantId, reason)` returns false for unknown IDs, true for an existing or successful new revocation, and throws on store failure. First revocation time/reason survive concurrent updates. `isGrantRevoked` checks only the record's own revocation and throws for unknown IDs; use `verifyPrincipal` for effective authorization including ancestors.

`GrantStore.delete` creates a durable tombstone so delayed writes cannot resurrect the ID. Administrative retention/purge policy needs separate reviewed governance and is not implemented here. Runtime roles cannot physically delete. Revocation is observed at subsequent authorization checks, including new processes; it does not retroactively cancel an already-authorized external effect. Effect cancellation belongs to its owning task.

## Migration and key rotation

Historical memory tokens and records missing canonical identity claims require authenticated reissuance. Never backfill authority from an untrusted token. Original task 03 evidence and Principal wire contracts are preserved; M03 tracks V2 readiness separately.

Generate keys with `generateSigningKey(kid, ttlMs)` in trusted bootstrap. IDs must be unique, defaultKid must exist, and expiry must follow creation. Add a new key while retaining valid old keys, distribute configuration, then change defaultKid. Remove old keys after their authorization window, or immediately on compromise alongside trusted grant revocation. Future/expired key checks apply to signing and verification. Never log key configuration or tokens.

## Local qualification and limits

`infra/Dockerfile.identity` pins official Node 24.19.0 by digest, copies explicit manifests and compiled contracts/identity artifacts, installs their production dependency closure plus the existing control pg driver with a frozen lockfile and disabled lifecycle scripts, and runs as non-root. Compile both packages before building `asi/identity:m03-qualification`.

`infra/compose.yaml` has an explicit `qualification` profile. Its worker has no private mounts or credential configuration, a read-only root, user 1000, network none, all capabilities dropped and no-new-privileges. Tests inspect the actual process and deny synthetic credential injection without printing values.

Run the named checks from the root:

```powershell
pnpm exec vitest run --project unit packages/identity/test/grants.test.ts
pnpm exec vitest run --project security tests/security/credentials.test.ts
pnpm typecheck
pnpm exec vitest run --project integration tests/integration/identity-v2-restart.test.ts
```

The current credential tests use native Windows identity processes with sanitized environments and explicit private bootstrap. OS-level credential/filesystem isolation still requires Task12 qualification; removed image/mount checks are historical and are not claimed passed by these tests. Integration uses local PostgreSQL on Windows with a disposable `*_qualification` database, unique schema and restricted role, applies 001/009, and removes its own schema/role. Default local endpoint is port 60636/database `asi_m03_qualification`; `M03_TEST_DATABASE_URL` overrides it privately. Never target production.

Independent native identity processes on Windows verify PostgreSQL-backed authority across process restart. Synthetic trusted bootstrap goes through private stdin, never worker mounts, task payloads or printed logs. The trusted qualification runner may create disposable schemas; bootstrap privileges do not define the runtime role.

Evidence separates unit, real PostgreSQL, native identity restart and historical Linux process/mount receipts. Linux deployment files are removed from the active product. The Windows release host must repeat its host-specific checks; repeat guest-specific checks only if the optional VM is used. Standalone Linux release-host qualification is deferred. M03 does not qualify the full Gateway service, Task 12 sandbox, production migration runner or deployment.

## Operations

Use bounded trusted health probes for key validity, database connectivity and expected-audience verification without exposing configuration. Route safe summaries and IDs to the owning audit system; this library has no audit sink. Deny dependent effects on failure, then investigate clock skew, audience, keys, canonical claims, ancestry, tombstones or database availability. Do not broaden permissions or switch to a fixture store to recover service.

