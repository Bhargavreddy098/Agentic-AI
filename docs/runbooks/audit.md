# Audit receipt owner runbook

> **Current platform scope — 2026-10-15:** Build and deploy the Windows version only. Linux is allowed only as an optional VM guest for qualified isolation; standalone Linux hosts/releases are deferred. This supersedes earlier platform assumptions in this document. PostgreSQL/Redis and ordinary integration/security tests remain in the Windows work queue. Preserve required protections and tests; unsupported executable paths stay disabled. See ADR 0004.

Task05 qualifies the receipt owner under the reviewed boundary in docs/decisions/0002-mcp-revision.md. It does not certify policy, budgets, isolated tools, external effects or production deployment. Original completion evidence remains historical; fresh qualification belongs in the ledgers.

## Trusted construction

Use createAuditService(config) in the trusted service, binding a PostgreSQL Pool, authenticated tenantId and ownerId, active keyId/signingKey, retained verificationKeys and optional AbortSignal. HMAC keys are at least32 bytes and copied at construction. Keep credentials and keys outside task payloads, agent mounts, exports and logs. A pg pool must explicitly set connectionTimeoutMillis from1through5000; missing/unbounded configuration denies. Audit admission is limited to64 outstanding operations per shared pool.

The planned methods remain appendReceipt(input) and verifyReceiptChain(receipts). appendReceipt input is the canonical AuditReceipt without sequence, previousHash or signature. Every remaining identity, hash, terminal status, mode, policyVersion, timestamp and keyId is required. Supplied timestamp is validated then replaced by server time; keyId must be the active configured key. Config-first appendReceipt(config,input) is a compatibility wrapper returning {receipt,sequence:bigint}; receipt.sequence itself is a safe JavaScript number. Incomplete legacy payloads and status completed are rejected.

The owner requires an existing immutable M04 effect intent, matching tenant/session/run/inputHash/mode and current authenticated writer. The effect must be executing or already have the requested terminal status. It never updates the effect journal, executes a tool, authorizes policy, invents an output hash or substitutes for atomic budgets. The governed dispatch owner must supply the actual outcome hash and compose these qualified owners before effects are accepted.

## Storage and migration

The explicit reviewed closure is001-control.sql,009-identity-grants.sql,010-control-qualification.sql,014-audit-qualification.sql. Applied prerequisites remain unchanged. Inspect the read-only plan with:

    node scripts/apply-migrations.mjs --target 05

Never glob migrations by numeric prefix. The runner validates recorded human review, qualified prerequisites, schema identity and immutable applied checksums, then applies the closure transactionally under an advisory lock. A separate trusted operator approval is required for production application; this task runs only disposable local qualification.

014 refuses every nonempty legacy audit chain before changing receipt data. Preserve the legacy database, signing keys and terminal checkpoint; obtain concrete migration review. Do not delete receipts, reset the chain, backfill fabricated identities/hashes, re-sign old evidence or disable checks to continue.

audit_receipts is the sole receipt store. It retains canonical JSON, its exact UTF8 bytes/hash and checked relational projections, safe sequence, required identifiers/outputHash and canonical succeeded/failed/unknown status. Composite references enforce tenant/session/run/effect binding. A locked tenant audit_chain_heads row allocates sequence and previous hash; a receipt trigger advances it atomically. Runtime UPDATE/DELETE/TRUNCATE of receipts or direct head changes fail. FORCE RLS uses transaction-local asi.tenant_id; owner scope uses asi.owner_id. Missing scope yields no authority. M04 writer fencing evaluates server time after lock waits.

Provision a non-owner NOSUPERUSER NOBYPASSRLS trusted service role. Its existing control permissions must support the ordered session/run/lease row locks. Audit needs SELECT/INSERT on receipts and SELECT/INSERT/UPDATE on its heads; the trigger guards constrain head UPDATE. Do not grant schema CREATE, role administration, BYPASSRLS, superuser or trigger-disabling privileges to this role. Tests deliberately grant broader table privileges to prove trigger enforcement. Database administrators remain capable of altering enforcement and must be managed independently.

## Signing and verification

Sign these bytes with HMAC-SHA256:

    UTF8("ASI-AUDIT-RECEIPT-v1\n" + compactCanonicalJson(allCanonicalFieldsExceptSignature))

The public AuditReceipt contract is unchanged. Keys sort by UTF16 code-unit order; this receipt schema contains flat primitive fields. Signatures and hashes are64 lowercase hexadecimal characters. Genesis previousHash is64 zeroes. Each next previousHash is SHA256 of the entire preceding canonical signed receipt, including signature. Sequence starts at1 and must remain a safe integer.

verifyExportedReceiptChain(receipts,{tenantId,verificationKeys,checkpoint?}) needs no database. It validates canonical fields, tenant, sequence, links, every signature and duplicate identities. Unknown keys, unsafe integers, accessors/proxies, partial/reordered/deleted/modified receipts deny. Keys come from the trusted verifier, never from an export. Without an independently retained terminal checkpoint, a valid prefix cannot prove that the tail has not been removed.

An AuditCheckpoint contains tenantId, receiptCount, terminalSequence and terminalReceiptHash. Retain it outside the database/export trust domain at a known accepted point. A checkpoint taken from the same currently inspected export is a consistency check, not independent tail-truncation evidence. A previously retained prefix remains valid while later append-only receipts arrive.

## Bounded exports and larger histories

exportReceiptChain(config) returns complete canonical receipts and a checkpoint in one REPEATABLE READ snapshot. Its bounded array limit is10000 receipts and16MiB. A ranged export with bigint from/to is explicitly complete:false and is diagnostic data; never treat it as a complete verified chain.

For larger histories, obtain/retain a checkpoint, then pass exportReceiptChainChunks(config,checkpoint) to verifyReceiptChainChunks(chunks,{tenantId,verificationKeys,checkpoint,signal}). Each page contains at most1000 receipts, closes its PostgreSQL transaction before yielding, and exports only the immutable prefix ending at that checkpoint. The incremental verifier checks every tenant/sequence/link/signature and terminal checkpoint with constant history state. It checks duplicate identities within a batch; database uniqueness and the trusted signer own identity uniqueness across the full history. This avoids an unbounded in-memory identity index. The array verifier additionally checks all IDs within its bounded input.

An async source is trusted caller code, not serialized task input. It must honor cancellation and release its own resources. Iterator waits are bounded to5seconds, cleanup to1second, and a complete verification to30seconds. The database verifier uses the same bounded paging path. Larger operational jobs that exceed this deadline require explicit sizing/qualification; do not silently disable limits.

## Rotation, retries and failures

Retain previous verification keys while switching active keyId/signingKey. Never re-sign or mutate historical receipts. The same effect/receipt identity and immutable outcome returns the original verified receipt, including its original keyId/signature, even after active-key rotation. Changed output/status/policy/identity fails. Missing old verification keys prevents reuse/verification.

There are no automatic append retries. On timeout, cancellation or lost commit acknowledgement, reconnect and reconcile the immutable effect/receipt using the same identity/outcome. A commit may have succeeded before acknowledgement failed. Do not blindly re-execute the external effect. This owner makes no exactly-once external-effect claim.

Connection acquisition and SQL exchanges have client-side deadlines; PostgreSQL statement/lock timeouts add defense. Cancellation or a stalled socket destroys that client rather than returning it to the pool. Rollback wait is bounded. Missing storage/signing/binding/current-writer authority denies append. The future governed-effect composition must stop effects when required enforcement is unavailable and reconcile uncertain outcomes; receipt construction alone is not that composition.

HMAC verification authenticates a trusted shared key holder. A verifier with that key can also forge signatures; it is not public-key nonrepudiation. Key compromise and privileged database/backup tampering require independent controls. A retained checkpoint detects tail truncation only back to its retained point.

## Local acceptance and recovery

Run the owned suite against an explicitly disposable *_qualification PostgreSQL17 database using AUDIT_TEST_DATABASE_URL. The default fixture is loopback60638; it is not a production connection. Test schemas/roles are unique and dropped after each run; receipts are never deleted/truncated to reset tests.

    node node_modules/vitest/vitest.mjs run --project integration tests/integration/audit.test.ts
    node node_modules/typescript/bin/tsc -p packages/audit/tsconfig.json --noEmit
    node node_modules/eslint/bin/eslint.js packages/audit/src tests/integration/audit.test.ts scripts/apply-migrations.mjs

Separate real PostgreSQL/runtime-role/concurrency/reconnect tests from independently signed offline fixtures and stalled-transport/admission fixtures. Required setup failures are failures, never accepted skips. Recovery checks must compare persisted receipts and retained checkpoint across actual trusted service process restarts; a new pool alone is labeled reconnection. Record fresh results, independent review and global gate failures in ledgers before claiming qualification.
