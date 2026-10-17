import { randomBytes, createHmac, createHash } from "node:crypto";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve, join, sep, basename } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { safeSequence } from "../../packages/audit/src/append.js";
import * as Audit from "../../packages/audit/src/index.js";
import { appendReceipt, verifyReceiptChain, exportReceiptChain, type AuditAppendConfig, type VerifyReceiptConfig } from "../../packages/audit/src/index.js";
import { createControlServices, type ControlServices } from "../../packages/control/src/index.js";
import { applyReviewedMigrations, reviewedMigrationPlan } from "../../scripts/apply-migrations.mjs";
type Pool = ControlServices["pool"];
const root = resolve(import.meta.dirname, "../..");
const url = process.env.AUDIT_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:60638/asi_audit_qualification";
if (!new URL(url).pathname.endsWith("_qualification")) throw new Error("Disposable *_qualification database required");
const TEST_TENANT = "a", TEST_KEY_ID = "key-1", TEST_SIGNING_KEY = Buffer.alloc(32, 7);
const role = "audit_role_" + randomBytes(6).toString("hex");
const admin = createControlServices({ connectionString: url, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 10000 }, { tenantId: "admin" }).pool;
let pool: Pool, bootstrap: Pool, control: ControlServices, schema = "", deadline = "";
function createAppendConfig(): AuditAppendConfig {
  return { pool, tenantId: TEST_TENANT, ownerId: "owner-a", keyId: TEST_KEY_ID, signingKey: TEST_SIGNING_KEY,
    verificationKeys: new Map([[TEST_KEY_ID, TEST_SIGNING_KEY]]) };
}
function createVerifyConfig(): VerifyReceiptConfig {
  return { pool, tenantId: TEST_TENANT, verificationKeys: new Map([[TEST_KEY_ID, TEST_SIGNING_KEY]]) };
}
function receiptInput(id: string, keyId = TEST_KEY_ID) {
  return { schemaVersion: 1 as const, receiptId: "receipt-" + id, tenantId: TEST_TENANT, sessionId: "session-a",
    runId: "run-a", effectId: id, inputHash: "a".repeat(64), outputHash: "b".repeat(64),
    status: "succeeded" as const, mode: "execute" as const, policyVersion: "policy-1", timestamp: "2000-01-01T00:00:00.000Z", keyId };
}
async function prepare(id: string, resource = "local-file") {
  await control.effects.recordEffectIntent({ schemaVersion: 1, effectId: id, action: "read", resource,
    inputHash: "a".repeat(64), idempotencyKey: id, traceId: "trace-" + id,
    runContext: { sessionId: "session-a", runId: "run-a", writerEpoch: 1, mode: "execute", deadlineAt: deadline,
      budgetRef: { tenantId: TEST_TENANT, accountId: "account-a", rootRunId: "run-a" } } });
  await control.effects.authorizeEffect(id);
  await control.effects.startEffect(id);
  return receiptInput(id);
}
async function append(id: string) { return appendReceipt(createAppendConfig(), await prepare(id)); }
async function receipts(count = 3) {
  for (let i = 1; i <= count; i++) await append("effect-" + i);
  return (await exportReceiptChain({ pool, tenantId: TEST_TENANT })).receipts;
}
const fullHash = (value: Record<string, unknown>) => createHash("sha256").update(JSON.stringify(value, Object.keys(value).sort())).digest("hex");
async function scoped(sql: string, tenant = "a", params: unknown[] = []) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id','owner-a',true)", [tenant]);
    const result = await client.query(sql, params);
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
describe("Original Task05 acceptance coverage", () => {
beforeAll(async () => {
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
  await admin.query("CREATE ROLE " + role + " NOLOGIN NOSUPERUSER NOBYPASSRLS");
}, 30000);
afterAll(async () => {
  await admin.query("DROP ROLE IF EXISTS " + role);
  await admin.end();
});
const closedPools=new WeakSet<Pool>();
async function closeFixturePool(value?:Pool){if(value&&!closedPools.has(value)){closedPools.add(value);await value.end();}}
afterEach(async () => {
  try{await closeFixturePool(pool);}finally{try{await closeFixturePool(bootstrap);}finally{if(schema)await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");}}
});
describe("Audit Receipts", () => {
  beforeEach(async () => {
    schema = "audit_" + randomBytes(6).toString("hex");
    await admin.query("CREATE SCHEMA " + schema);
    bootstrap = createControlServices({ connectionString: url, options: "-c search_path=" + schema + ",public", max: 2 }, { tenantId: "admin" }).pool;
    const client = await bootstrap.connect();
    try { await applyReviewedMigrations(client, { schema, target: existsSync(resolve(root, "db/postgres/migrations/014-audit-qualification.sql")) ? "05" : "M04" }); }
    finally { client.release(); }
    await bootstrap.query("GRANT USAGE ON SCHEMA " + schema + " TO " + role);
    await bootstrap.query("GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA " + schema + " TO " + role);
    control = createControlServices({ connectionString: url, options: "-c search_path=" + schema + ",public -c role=" + role, max: 12, connectionTimeoutMillis: 5000 }, { tenantId: TEST_TENANT, ownerId: "owner-a" });
    pool = control.pool;
    deadline = new Date(Date.now() + 120000).toISOString();
    await bootstrap.query("INSERT INTO tenants(tenant_id,display_name) VALUES ('a','A'),('b','B')");
    await bootstrap.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd) VALUES ('account-a','a','test',1000)");
    await bootstrap.query("INSERT INTO sessions(session_id,tenant_id,principal_id,mode) VALUES ('session-a','a','user','execute')");
    await bootstrap.query("INSERT INTO runs(run_id,session_id,tenant_id,mode,deadline_at,budget_account_id) VALUES ('run-a','session-a','a','execute',$1,'account-a')", [deadline]);
    await control.leases.claimSession("session-a", "run-a");
  }, 30000);
  it("appends first receipt with sequence 1 and zero previous_hash", async () => {
    const result = await append("effect-1");
    expect(result.sequence).toBe(1n);
    expect(result.receipt.receiptId).toBe("receipt-effect-1");
    expect(result.receipt.tenantId).toBe(TEST_TENANT);
    expect(result.receipt.sequence).toBe(1);
    expect(result.receipt.previousHash).toBe("0".repeat(64));
    expect(result.receipt.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(new Date(result.receipt.timestamp).getTime()).toBeGreaterThan(Date.now() - 10000);
  });

  it("appends sequential receipts with chained previous_hash", async () => {
    const values = [];
    for (let i = 0; i < 5; i++) values.push(await append("effect-" + i));
    expect(values.map(value => value.sequence)).toEqual([1n, 2n, 3n, 4n, 5n]);
    for (let i = 1; i < values.length; i++) expect(values[i]!.receipt.previousHash).toBe(fullHash(values[i - 1]!.receipt));
  });

  it("verifies valid receipt chain", async () => {
    await receipts(10);
    expect(await verifyReceiptChain(createVerifyConfig())).toEqual({ valid: true });
  });

  it("detects tampered signature", async () => {
    const values = await receipts(1);
    values[0] = { ...values[0]!, signature: "0".repeat(64) };
    expect((await Audit.verifyExportedReceiptChain(values, createVerifyConfig())).valid).toBe(false);
    await expect(scoped("UPDATE audit_receipts SET signature=decode(repeat('0',64),'hex')")).rejects.toThrow();
  });

  it("detects deleted middle receipt (sequence gap)", async () => {
    const values = await receipts(5);
    values.splice(2, 1);
    expect((await Audit.verifyExportedReceiptChain(values, createVerifyConfig())).valid).toBe(false);
    await expect(scoped("DELETE FROM audit_receipts WHERE sequence=3")).rejects.toThrow();
  });

  it("detects modified input_hash", async () => {
    const values = await receipts(1);
    values[0] = { ...values[0]!, inputHash: "c".repeat(64) };
    expect((await Audit.verifyExportedReceiptChain(values, createVerifyConfig())).valid).toBe(false);
    await expect(scoped("UPDATE audit_receipts SET input_hash=decode(repeat('c',64),'hex')")).rejects.toThrow();
  });

  it("verifies with rotated keys", async () => {
    const key1 = randomBytes(32), key2 = randomBytes(32);
    const config = createAppendConfig();
    await appendReceipt({ ...config, keyId: "key-1", signingKey: key1 }, await prepare("effect-1"));
    await appendReceipt({ ...config, keyId: "key-2", signingKey: key2 }, { ...await prepare("effect-2"), keyId: "key-2" });
    expect(await verifyReceiptChain({ pool, tenantId: TEST_TENANT, verificationKeys: new Map([["key-1", key1], ["key-2", key2]]) })).toEqual({ valid: true });
  });

  it("fails verification with unknown key_id", async () => {
    await append("effect-1");
    expect((await verifyReceiptChain({ pool, tenantId: TEST_TENANT, verificationKeys: new Map([["unknown-key", randomBytes(32)]]) })).valid).toBe(false);
  });

  it("exports receipt chain with terminal hash", async () => {
    const values = await receipts(3), exported = await exportReceiptChain({ pool, tenantId: TEST_TENANT });
    expect(exported.tenantId).toBe(TEST_TENANT);
    expect(exported.receiptCount).toBe(3);
    expect(exported.receipts).toHaveLength(3);
    expect(exported.complete).toBe(true);
    expect(exported.terminalReceiptHash).toBe(fullHash(values[2]!));
    expect(await Audit.verifyExportedReceiptChain(exported.receipts, { ...createVerifyConfig(), checkpoint: exported.checkpoint })).toEqual({ valid: true });
  });

  it("exports receipt chain with sequence range filter", async () => {
    await receipts(5);
    const exported = await exportReceiptChain({ pool, tenantId: TEST_TENANT }, 2n, 4n);
    expect(exported.receiptCount).toBe(3);
    expect(exported.receipts[0]!.sequence).toBe(2);
    expect(exported.receipts[2]!.sequence).toBe(4);
    expect(exported.complete).toBe(false);
    expect((await Audit.verifyExportedReceiptChain(exported.receipts, createVerifyConfig())).valid).toBe(false);
  });

  it("denies new effects when receipt storage unavailable", async () => {
    const input = await prepare("effect-1");
    const unavailable = createControlServices({ connectionString: url, max: 1, connectionTimeoutMillis: 1000 }, { tenantId: "a" }).pool;
    await unavailable.end();
    let effects = 0;
    await expect((async () => { await appendReceipt({ ...createAppendConfig(), pool: unavailable }, input); effects++; })()).rejects.toThrow();
    expect(effects).toBe(0);
    expect((await bootstrap.query("SELECT * FROM audit_receipts")).rows).toHaveLength(0);
  });
  it("receipt genesis uses the zero hash and safe numeric sequence", async () => {
    const result = await append("effect-genesis");
    expect(result.receipt.previousHash).toBe("0".repeat(64));
    expect(result.receipt.sequence).toBe(1);
    expect(Number.isSafeInteger(result.receipt.sequence)).toBe(true);
  });
  it("allocates unique contiguous receipt sequences for concurrent effects", async () => {
    const inputs = [];
    for (let i = 0; i < 12; i++) inputs.push(await prepare("concurrent-" + i));
    const results = await Promise.all(inputs.map(input => appendReceipt(createAppendConfig(), input)));
    expect(results.map(value => value.receipt.sequence).sort((a,b) => a-b)).toEqual(Array.from({ length: 12 }, (_,i) => i+1));
    expect(await verifyReceiptChain(createVerifyConfig())).toEqual({ valid: true });
  });
  it("same effect append is idempotent and conflicting outcomes are denied", async () => {
    const input = await prepare("effect-once");
    const [first, second] = await Promise.all([appendReceipt(createAppendConfig(), input), appendReceipt(createAppendConfig(), input)]);
    expect(first).toEqual(second);
    for (const changed of [{ ...input, outputHash: "c".repeat(64) }, { ...input, receiptId: "other" }, { ...input, status: "failed" as const }, { ...input, policyVersion: "other" }]) {
      await expect(appendReceipt(createAppendConfig(), changed)).rejects.toThrow();
    }
    expect((await exportReceiptChain({ pool, tenantId: "a" })).receiptCount).toBe(1);
  });
  it("missing canonical fields, unsigned legacy status and cross-tenant/run bindings deny", async () => {
    const input = await prepare("effect-binding");
    for (const changed of [{ ...input, effectId: "absent" }, { ...input, tenantId: "b" }, { ...input, sessionId: "other" }, { ...input, runId: "other" }, { ...input, inputHash: "c".repeat(64) }, { ...input, outputHash: undefined }, { ...input, status: "completed" }, { ...input, keyId: "unknown" }]) {
      await expect(appendReceipt(createAppendConfig(), changed as never)).rejects.toThrow();
    }
    expect(() => Audit.createAuditService({ ...createAppendConfig(), ownerId: undefined } as never)).toThrow();
    expect((await bootstrap.query("SELECT * FROM audit_receipts")).rows).toHaveLength(0);
  });
  it("runtime-role tenant RLS, append-only protection and transaction-local scope enforce storage", async () => {
    await append("effect-1");
    expect((await scoped("SELECT * FROM audit_receipts", "b")).rows).toHaveLength(0);
    expect((await scoped("SELECT * FROM audit_chain_heads", "b")).rows).toHaveLength(0);
    for (const sql of ["DELETE FROM audit_receipts", "TRUNCATE audit_receipts", "UPDATE audit_chain_heads SET sequence=0", "DELETE FROM audit_chain_heads", "TRUNCATE audit_chain_heads"]) await expect(scoped(sql)).rejects.toThrow();
    const client = await pool.connect();
    try { expect((await client.query("SELECT current_setting('asi.tenant_id',true) AS tenant")).rows[0].tenant || "").toBe(""); }
    finally { client.release(); }
  });
  it.each(["cancelled", "deadline", "lease", "owner", "epoch"])("denies receipt append for stale authority: %s", async kind => {
    const input = await prepare("effect-stale");
    if (kind === "cancelled") await bootstrap.query("UPDATE runs SET status='cancelled'");
    if (kind === "deadline") await bootstrap.query("UPDATE runs SET deadline_at=clock_timestamp()-interval '1 second'");
    if (kind === "lease") await bootstrap.query("UPDATE writer_leases SET expires_at=clock_timestamp()-interval '1 second'");
    if (kind === "owner") await bootstrap.query("UPDATE writer_leases SET owner_id='someone-else'");
    if (kind === "epoch") { await bootstrap.query("UPDATE writer_leases SET expires_at=clock_timestamp()-interval '1 second'"); await control.leases.claimSession("session-a","run-a"); }
    await expect(appendReceipt(createAppendConfig(), input)).rejects.toThrow();
    expect((await bootstrap.query("SELECT * FROM audit_receipts")).rows).toHaveLength(0);
  });
  it("aborted receipt writes never allocate a sequence", async () => {
    const input = await prepare("effect-abort"), controller = new AbortController();
    controller.abort();
    await expect(Audit.createAuditService({ ...createAppendConfig(), signal: controller.signal }).appendReceipt(input)).rejects.toThrow();
    expect((await bootstrap.query("SELECT * FROM audit_receipts")).rows).toHaveLength(0);
  });
  it("rechecks lease expiry after waiting for the tenant head lock", async () => {
    await append("effect-1");
    const input = await prepare("effect-2");
    await bootstrap.query("UPDATE writer_leases SET expires_at=clock_timestamp()+interval '1 second'");
    const blocker = await bootstrap.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT * FROM audit_chain_heads FOR UPDATE");
      const pending = appendReceipt(createAppendConfig(), input).then(() => false, () => true);
      await new Promise(resolve => setTimeout(resolve, 1200));
      await blocker.query("COMMIT");
      expect(await pending).toBe(true);
      expect((await exportReceiptChain({ pool, tenantId: "a" })).receiptCount).toBe(1);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  it("reconnection retains canonical receipts and independent checkpoint verification", async () => {
    const first = await append("effect-1"), retained = (await exportReceiptChain({ pool, tenantId: "a" })).checkpoint;
    await pool.end();
    control = createControlServices({ connectionString: url, options: "-c search_path=" + schema + ",public -c role=" + role, connectionTimeoutMillis: 5000 }, { tenantId: "a", ownerId: "owner-a" }); pool = control.pool;
    const values = (await exportReceiptChain({ pool, tenantId: "a" })).receipts;
    expect(values).toEqual([first.receipt]);
    expect(await Audit.verifyExportedReceiptChain(values, { ...createVerifyConfig(), checkpoint: retained })).toEqual({ valid: true });
  });


  it("cancellation while waiting for a database lock rolls back allocation", async () => {
    await append("effect-1");
    const input = await prepare("effect-cancel-lock"), controller = new AbortController(), blocker = await bootstrap.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT * FROM audit_chain_heads FOR UPDATE");
      const pending = Audit.createAuditService({ ...createAppendConfig(), signal: controller.signal }).appendReceipt(input).then(() => false, () => true);
      await new Promise(resolve => setTimeout(resolve, 100));
      controller.abort(); await blocker.query("COMMIT");
      expect(await pending).toBe(true);
      expect((await exportReceiptChain({ pool, tenantId: "a" })).receiptCount).toBe(1);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  it("nonempty legacy receipt migration aborts without changing evidence", async () => {
    const legacySchema = "audit_legacy_" + randomBytes(6).toString("hex"), client = await bootstrap.connect();
    try {
      await client.query("CREATE SCHEMA " + legacySchema);
      await applyReviewedMigrations(client, { schema: legacySchema, target: "M04" });
      await client.query("INSERT INTO " + legacySchema + ".tenants(tenant_id,display_name) VALUES ('legacy','Legacy')");
      await client.query("INSERT INTO " + legacySchema + ".audit_receipts(receipt_id,tenant_id,sequence,previous_hash,input_hash,status,mode,policy_version,key_id,signature) VALUES ('legacy-receipt','legacy',1,$1,$2,'completed','execute','policy-1','key-1',$3)", [Buffer.alloc(32),Buffer.alloc(32,1),Buffer.alloc(32,2)]);
      const before = (await client.query("SELECT * FROM " + legacySchema + ".audit_receipts")).rows;
      await expect(applyReviewedMigrations(client, { schema: legacySchema, target: "05" })).rejects.toThrow("Nonempty legacy");
      expect((await client.query("SELECT * FROM " + legacySchema + ".audit_receipts")).rows).toEqual(before);
      expect((await client.query("SELECT migration_id FROM " + legacySchema + ".schema_migrations")).rows).toHaveLength(3);
      expect((await client.query("SELECT to_regclass($1) AS table", [legacySchema + ".audit_chain_heads"])).rows[0].table).toBeNull();
    } finally { await client.query("DROP SCHEMA IF EXISTS " + legacySchema + " CASCADE"); client.release(); }
  });
  it("runtime role cannot inject a cross-tenant receipt or change canonical projections", async () => {
    const first = await append("effect-1");
    const columns = ["receipt_id","tenant_id","session_id","run_id","effect_id","sequence","previous_hash","input_hash","output_hash","status","mode","policy_version","timestamp","key_id","signature","receipt_json","canonical_bytes","receipt_hash"];
    const row = (await bootstrap.query("SELECT * FROM audit_receipts")).rows[0];
    const values = columns.map(name => row[name]);
    values[0] = "forged"; values[1] = "b";
    const sql = "INSERT INTO audit_receipts(" + columns.join(",") + ") VALUES(" + columns.map((_,i) => "$" + (i+1)).join(",") + ")";
    await expect(scoped(sql, "a", values)).rejects.toThrow();
    await expect(scoped("UPDATE audit_receipts SET receipt_json=receipt_json||'{\"policyVersion\":\"forged\"}'")).rejects.toThrow();
    expect((await exportReceiptChain({ pool, tenantId: "a" })).receipts).toEqual([first.receipt]);
  });

  it("idempotent effect outcome survives signing-key rotation with the old verification key retained", async () => {
    const input = await prepare("effect-key-retry"), first = await appendReceipt(createAppendConfig(), input), secondKey = Buffer.alloc(32,9);
    const rotated = { ...createAppendConfig(), keyId: "key-2", signingKey: secondKey,
      verificationKeys: new Map([["key-1",TEST_SIGNING_KEY],["key-2",secondKey]]) };
    expect(await appendReceipt(rotated, { ...input, keyId:"key-2" })).toEqual(first);
    expect((await exportReceiptChain({ pool, tenantId:"a" })).receiptCount).toBe(1);
  });

  it.each(["timestamp-null","intent-mode-null"])("storage guards reject SQL NULL ambiguity: %s", async kind => {
    const first = await append("effect-1");
    await prepare("effect-2");
    let effectId = "effect-2";
    if (kind === "intent-mode-null") {
      effectId = "effect-null";
      await scoped("INSERT INTO effect_journal(effect_id,tenant_id,run_id,effect_type,action,resource,input_hash,idempotency_key,status,writer_epoch,intent_json) SELECT 'effect-null',tenant_id,run_id,effect_type,action,resource,input_hash,'effect-null','planned',writer_epoch,jsonb_set(intent_json,'{runContext,mode}','null') FROM effect_journal WHERE effect_id='effect-2'");
      await control.effects.authorizeEffect(effectId); await control.effects.startEffect(effectId);
    }
    const row = (await bootstrap.query("SELECT * FROM audit_receipts")).rows[0];
    const receipt = { ...first.receipt, receiptId: "receipt-null", effectId, sequence: 2, previousHash: fullHash(first.receipt),
      ...(kind === "timestamp-null" ? { timestamp: null } : {}) };
    const bytes = Buffer.from(JSON.stringify(receipt,Object.keys(receipt).sort()));
    const columns = ["receipt_id","tenant_id","session_id","run_id","effect_id","sequence","previous_hash","input_hash","output_hash","status","mode","policy_version","timestamp","key_id","signature","receipt_json","canonical_bytes","receipt_hash"];
    const changed = { ...row,receipt_id:receipt.receiptId,effect_id:effectId,sequence:2,previous_hash:Buffer.from(receipt.previousHash,"hex"),receipt_json:receipt,canonical_bytes:bytes,receipt_hash:createHash("sha256").update(bytes).digest() };
    await expect(scoped("INSERT INTO audit_receipts(" + columns.join(",") + ") VALUES(" + columns.map((_,i) => "$"+(i+1)).join(",") + ")", "a", columns.map(name => changed[name]))).rejects.toThrow();
  });

  it("exports bounded immutable pages for independent complete-chain verification", async () => {
    await receipts(3);
    const retained = (await exportReceiptChain({pool,tenantId:"a"},1n,1n)).checkpoint;
    const chunks = Audit.exportReceiptChainChunks({pool,tenantId:"a"},retained);
    expect(await Audit.verifyReceiptChainChunks(chunks,{...createVerifyConfig(),checkpoint:retained})).toEqual({valid:true});
  });

  it("trusted audit processes restart and independently verify the same persisted receipts", async () => {
    await receipts(3);
    const expected=await exportReceiptChain({pool,tenantId:"a"});
    const script=[
      'import {createRequire} from "node:module";',
      'import {exportReceiptChain,verifyExportedReceiptChain} from '+JSON.stringify(pathToFileURL(resolve(root,"packages/audit/dist/index.js")).href)+';',
      'const {Pool}=createRequire('+JSON.stringify(pathToFileURL(resolve(root,"packages/audit/package.json")).href)+')("pg");',
      'const pool=new Pool({connectionString:process.env.AUDIT_RESTART_DATABASE,options:"-c search_path="+process.env.AUDIT_RESTART_SCHEMA+",public -c role="+process.env.AUDIT_RESTART_ROLE,connectionTimeoutMillis:5000,max:1});',
      'try {const chain=await exportReceiptChain({pool,tenantId:"a"});const valid=await verifyExportedReceiptChain(chain.receipts,{tenantId:"a",verificationKeys:new Map([["key-1",Buffer.alloc(32,7)]]),checkpoint:JSON.parse(process.env.AUDIT_RESTART_CHECKPOINT)});process.stdout.write(JSON.stringify({pid:process.pid,receipts:chain.receipts,valid}));}finally{await pool.end();}'
    ].join("\n");
    const run=async()=>{
      const result=await promisify(execFile)(process.execPath,["--input-type=module","-e",script],{
        cwd:root,timeout:10000,maxBuffer:65536,windowsHide:true,
        env:{SystemRoot:process.env.SystemRoot,Path:process.env.Path,AUDIT_RESTART_DATABASE:url,AUDIT_RESTART_SCHEMA:schema,AUDIT_RESTART_ROLE:role,AUDIT_RESTART_CHECKPOINT:JSON.stringify(expected.checkpoint)}
      });
      return JSON.parse(result.stdout);
    };
    const first=await run(),second=await run();
    expect(first.pid).not.toBe(second.pid);
    expect(first.receipts).toEqual(expected.receipts);
    expect(second.receipts).toEqual(expected.receipts);
    expect(first.valid).toEqual({valid:true});expect(second.valid).toEqual({valid:true});
  }, 30000);

  it.each(["missing","lowered"])("detects a privileged restore with %s chain head", async kind => {
    const values=await receipts(2);
    // Deliberate corruption of this disposable administrator-owned fixture; normal runtime head writes remain forbidden.
    await bootstrap.query("ALTER TABLE audit_chain_heads DISABLE TRIGGER audit_head_changes");
    try {
      if(kind==="missing") await bootstrap.query("DELETE FROM audit_chain_heads");
      else await bootstrap.query("UPDATE audit_chain_heads SET sequence=1,receipt_hash=$1",[Buffer.from(fullHash(values[0]!),"hex")]);
    } finally {await bootstrap.query("ALTER TABLE audit_chain_heads ENABLE TRIGGER audit_head_changes");}
    expect((await verifyReceiptChain(createVerifyConfig())).valid).toBe(false);
    await expect(exportReceiptChain({pool,tenantId:"a"},1n,1n)).rejects.toThrow();
  });

  it("exports only canonical receipt metadata and never effect secrets or signing keys", async () => {
    const secret="TASK05_PRIVATE_SENTINEL_do_not_export",input=await prepare("effect-secret",secret);
    await control.effects.completeEffect(input.effectId,{rawSecret:secret});
    await expect(appendReceipt(createAppendConfig(),{...input,rawSecret:secret} as never)).rejects.toThrow();
    await appendReceipt(createAppendConfig(),{...input,outputHash:fullHash({rawSecret:secret})});
    const exported=await exportReceiptChain({pool,tenantId:"a"}),serialized=JSON.stringify(exported);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(TEST_SIGNING_KEY.toString("hex"));
    expect(serialized).not.toContain("rawSecret");
    expect(await verifyReceiptChain(createVerifyConfig())).toEqual({valid:true});
  });

  it("pages a live chain across released snapshots while later appends continue", async () => {
    await prepare("bulk-template");
    // Bounded bulk fixture uses the real runtime role and all M04/014 triggers; signing remains in this trusted test process.
    await scoped("INSERT INTO effect_journal(effect_id,tenant_id,run_id,effect_type,action,resource,input_hash,idempotency_key,status,writer_epoch,intent_json) SELECT 'bulk-'||n,tenant_id,run_id,effect_type,action,resource,input_hash,'bulk-'||n,'planned',writer_epoch,intent_json||jsonb_build_object('effectId','bulk-'||n,'idempotencyKey','bulk-'||n,'traceId','bulk-'||n) FROM effect_journal CROSS JOIN generate_series(1,1001) AS n WHERE effect_id='bulk-template'");
    await scoped("UPDATE effect_journal SET status='authorized' WHERE effect_id<>'bulk-template'");
    await scoped("UPDATE effect_journal SET status='executing',attempts=1 WHERE effect_id<>'bulk-template'");
    let previousHash="0".repeat(64);
    const payload=[];
    for(let n=1;n<=1001;n++){
      const body={...receiptInput("bulk-"+n),sequence:n,previousHash,timestamp:new Date().toISOString()};
      const signature=createHmac("sha256",TEST_SIGNING_KEY).update("ASI-AUDIT-RECEIPT-v1\n"+JSON.stringify(body,Object.keys(body).sort())).digest("hex");
      const receipt={...body,signature},canonical=JSON.stringify(receipt,Object.keys(receipt).sort());
      previousHash=fullHash(receipt);payload.push({receipt,canonical});
    }
    await scoped("INSERT INTO audit_chain_heads(tenant_id,sequence,receipt_hash) VALUES ('a',0,decode(repeat('0',64),'hex'))");
    await bootstrap.query("CREATE FUNCTION audit_fixture_bulk(payload jsonb) RETURNS void LANGUAGE plpgsql AS $$ DECLARE v_receipt jsonb;v_canonical text;BEGIN FOR v_receipt,v_canonical IN SELECT x.receipt,x.canonical FROM jsonb_to_recordset(payload) AS x(receipt jsonb,canonical text) ORDER BY (x.receipt->>'sequence')::bigint LOOP INSERT INTO audit_receipts(receipt_id,tenant_id,session_id,run_id,effect_id,sequence,previous_hash,input_hash,output_hash,status,mode,policy_version,timestamp,key_id,signature,receipt_json,canonical_bytes,receipt_hash) SELECT v_receipt->>'receiptId',v_receipt->>'tenantId',v_receipt->>'sessionId',v_receipt->>'runId',v_receipt->>'effectId',(v_receipt->>'sequence')::bigint,decode(v_receipt->>'previousHash','hex'),decode(v_receipt->>'inputHash','hex'),decode(v_receipt->>'outputHash','hex'),v_receipt->>'status',v_receipt->>'mode',v_receipt->>'policyVersion',(v_receipt->>'timestamp')::timestamptz,v_receipt->>'keyId',decode(v_receipt->>'signature','hex'),v_receipt,convert_to(v_canonical,'UTF8'),digest(convert_to(v_canonical,'UTF8'),'sha256');END LOOP;END $$");
    await scoped("SELECT audit_fixture_bulk($1::jsonb)","a",[JSON.stringify(payload)]);
    const retained=(await exportReceiptChain({pool,tenantId:"a"},1n,1n)).checkpoint;
    const pages=Audit.exportReceiptChainChunks({pool,tenantId:"a"},retained),first=await pages.next();
    expect(first.value).toHaveLength(1000);
    await append("effect-after-page");
    const second=await pages.next();
    expect(second.value).toHaveLength(1);expect((await pages.next()).done).toBe(true);
    async function* collected(){yield first.value!;yield second.value!;}
    expect(await Audit.verifyReceiptChainChunks(collected(),{...createVerifyConfig(),checkpoint:retained})).toEqual({valid:true});
    expect(await verifyReceiptChain(createVerifyConfig())).toEqual({valid:true});
    expect((await exportReceiptChain({pool,tenantId:"a"})).receiptCount).toBe(1002);
  }, 30000);

});
});

describe("Task05 independent canonical verification", () => {
  const keys = new Map([["key-1", Buffer.alloc(32, 7)], ["key-2", Buffer.alloc(32, 8)]]);
  const canonical = (value: Record<string, unknown>) => JSON.stringify(value, Object.keys(value).sort());
  function signed(sequence: number, previousHash: string, keyId = "key-1") {
    const body = { schemaVersion: 1, receiptId: "receipt-" + sequence, tenantId: "tenant-a",
      sessionId: "session-a", runId: "run-a", effectId: "effect-" + sequence, sequence, previousHash,
      inputHash: "a".repeat(64), outputHash: "b".repeat(64), status: "succeeded", mode: "execute",
      policyVersion: "policy-1", timestamp: "2026-10-09T16:00:00.000Z", keyId };
    return { ...body, signature: createHmac("sha256", keys.get(keyId)!).update("ASI-AUDIT-RECEIPT-v1\n" + canonical(body)).digest("hex") };
  }
  function chain() {
    const receipts = [signed(1, "0".repeat(64))];
    for (let i = 2; i <= 3; i++) receipts.push(signed(i, createHash("sha256").update(canonical(receipts[i-2]!)).digest("hex"), i === 3 ? "key-2" : "key-1"));
    return receipts;
  }
  const options = (): Audit.ExportVerificationConfig => ({ tenantId: "tenant-a", verificationKeys: keys });
  const verify = (receipts: unknown, config: Audit.ExportVerificationConfig = options()) => Audit.verifyExportedReceiptChain(receipts as never, config as never);
  const checkpoint = (receipts = chain()) => ({ tenantId: "tenant-a", receiptCount: receipts.length, terminalSequence: receipts.length,
    terminalReceiptHash: receipts.length ? createHash("sha256").update(canonical(receipts.at(-1)!)).digest("hex") : "0".repeat(64) });
  it("verifies independently signed canonical receipts and key rotation", async () => {
    expect(await verify(chain())).toEqual({ valid: true });
  });
  it.each(["inputHash", "outputHash", "signature", "effectId", "sessionId", "runId", "mode", "policyVersion", "timestamp", "tenantId", "status", "receiptId"])("rejects signed-field tampering: %s", async field => {
    const receipts = chain();
    const changed: Record<string,string> = { inputHash: "c".repeat(64), outputHash: "c".repeat(64), signature: "0".repeat(64),
      mode: "assist", timestamp: "2026-10-09T17:00:00.000Z", status: "failed" };
    receipts[0] = { ...receipts[0]!, [field]: changed[field] ?? "changed" };
    expect((await verify(receipts)).valid).toBe(false);
  });
  it("rejects unknown verification keys", async () => {
    expect((await verify(chain(), { ...options(), verificationKeys: new Map([["key-1", keys.get("key-1")!]]) })).valid).toBe(false);
  });
  it("rejects genesis changes, reordering, duplication and middle deletion", async () => {
    const receipts = chain();
    for (const changed of [[{ ...receipts[0], previousHash: "f".repeat(64) }, ...receipts.slice(1)], [...receipts].reverse(), [receipts[0], receipts[0]], [receipts[0], receipts[2]]]) {
      expect((await verify(changed)).valid).toBe(false);
    }
  });
  it("detects tail truncation against an externally retained checkpoint", async () => {
    const receipts = chain(), retained = checkpoint(receipts);
    expect(await verify(receipts, { ...options(), checkpoint: retained })).toEqual({ valid: true });
    expect((await verify(receipts.slice(0, 2), { ...options(), checkpoint: retained })).valid).toBe(false);
    expect((await verify([], { ...options(), checkpoint: retained })).valid).toBe(false);
    expect((await verify(receipts, { ...options(), checkpoint: { ...retained, terminalReceiptHash: "0".repeat(64) } })).valid).toBe(false);
    expect((await verify(receipts, { ...options(), checkpoint: { ...retained, tenantId: "other" } })).valid).toBe(false);
    expect(await verify([], { ...options(), checkpoint: checkpoint([]) })).toEqual({ valid: true });
  });
  it("rejects unsafe integers, accessors and proxies without executing user code", async () => {
    let reads = 0;
    const receipt = chain()[0]!;
    expect((await verify([{ ...receipt, sequence: Number.MAX_SAFE_INTEGER + 1 }])).valid).toBe(false);
    expect((await verify([{ ...receipt, extra: "unsigned" }])).valid).toBe(false);
    const accessor = { ...receipt };
    Object.defineProperty(accessor, "inputHash", { enumerable: true, get() { reads++; return "a".repeat(64); } });
    expect((await verify([accessor])).valid).toBe(false);
    const proxy = new Proxy(receipt, { ownKeys(target) { reads++; return Reflect.ownKeys(target); } });
    expect((await verify([proxy])).valid).toBe(false);
    expect(reads).toBe(0);
  });
  it("rejects oversized and partial chains", async () => {
    expect((await verify(Array(10001).fill(chain()[0]))).valid).toBe(false);
    expect((await verify(chain().slice(1))).valid).toBe(false);
  });
  it("verifies more than 10000 independently signed receipts in bounded chunks", async () => {
    let count = 0, previous = "0".repeat(64), terminal = previous;
    async function* chunks() {
      let chunk = [];
      for (let sequence=1;sequence<=10001;sequence++) {
        const receipt = signed(sequence,previous);
        previous = createHash("sha256").update(canonical(receipt)).digest("hex"); terminal=previous; count++;
        chunk.push(receipt);
        if (chunk.length === 500) { yield chunk; chunk=[]; }
      }
      if(chunk.length) yield chunk;
    }
    expect(await Audit.verifyReceiptChainChunks(chunks() as never,options())).toEqual({valid:true});
    expect(count).toBe(10001); expect(terminal).not.toBe("0".repeat(64));
  }, 15000);
  it("chunked verification enforces cross-chunk hashes, sequence and external checkpoint", async () => {
    const values = chain(), retained = checkpoint(values);
    async function* chunks(items = values) { for (const item of items) yield [item]; }
    expect(await Audit.verifyReceiptChainChunks(chunks() as never,{...options(),checkpoint:retained})).toEqual({valid:true});
    expect((await Audit.verifyReceiptChainChunks(chunks(values.slice(0,2)) as never,{...options(),checkpoint:retained})).valid).toBe(false);
    expect((await Audit.verifyReceiptChainChunks(chunks([values[0]!, values[2]!]) as never, options())).valid).toBe(false);
    expect((await Audit.verifyReceiptChainChunks(chunks([values[0]!, { ...values[1]!, previousHash: "f".repeat(64) }, values[2]!]) as never, options())).valid).toBe(false);
  });
  it("chunked verification bounds batch size and cancels a stalled source", async () => {
    async function* oversized() { yield Array(1001).fill(chain()[0]); }
    expect((await Audit.verifyReceiptChainChunks(oversized() as never,options())).valid).toBe(false);
    const controller = new AbortController();
    const source = { [Symbol.asyncIterator]() { return { next: () => new Promise(() => undefined) }; } };
    const pending = Audit.verifyReceiptChainChunks(source as never,{...options(),signal:controller.signal});
    setTimeout(()=>controller.abort(),20);
    const result = await Promise.race([pending,new Promise<{valid:unknown}>(resolve=>setTimeout(()=>resolve({valid:"unbounded"}),300))]);
    expect(result.valid).toBe(false);
  });

});

describe("Task05 reviewed migration closure", () => {
  it("accepts only the explicit reviewed audit prerequisite DAG", () => {
  expect(reviewedMigrationPlan({ target: "05" }).map((node: {file:string}) => node.file)).toEqual(["001-control.sql","002-audit.sql","009-identity-grants.sql","010-control-qualification.sql","014-audit-qualification.sql"]);
  });
});

describe("Task05 safe PostgreSQL integer decoding", () => {
  it("decodes BIGINT digit strings and rejects coercion or precision loss", () => {
    expect(safeSequence("1",1)).toBe(1);
    expect(safeSequence("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    for (const value of ["9007199254740992", Number.MAX_SAFE_INTEGER+1, "-1", "1.2", "1e2", "", true, null, {}, NaN]) expect(() => safeSequence(value)).toThrow();
    expect(() => safeSequence("0",1)).toThrow();
  });
});

describe("Task05 explicit migration approval denial", () => {
  it("historical original completion cannot authorize an unreviewed forward migration", () => {
    const directory = mkdtempSync(join(tmpdir(), "asi-audit-review-"));
    try {
      mkdirSync(join(directory,"docs")); mkdirSync(join(directory,"db/postgres/migrations"), { recursive: true });
      const ledger = JSON.parse(readFileSync(resolve(root,"docs/v2-task-ledger.json"), "utf8"));
      ledger.boundaryReviewRequests["05"].reviewStatus = "pending";
      writeFileSync(join(directory,"docs/v2-task-ledger.json"), JSON.stringify(ledger));
      copyFileSync(resolve(root,"docs/task-ledger.json"),join(directory,"docs/task-ledger.json"));
      for (const file of ["001-control.sql","002-audit.sql","009-identity-grants.sql","010-control-qualification.sql","014-audit-qualification.sql"]) copyFileSync(resolve(root,"db/postgres/migrations",file),join(directory,"db/postgres/migrations",file));
      expect(() => reviewedMigrationPlan({ root: directory, target:"05" })).toThrow("boundary review");
    } finally {
      const actual = realpathSync(directory), base = realpathSync(tmpdir());
      const cleanup=()=>{
        if (!actual.startsWith(base + sep) || !basename(actual).startsWith("asi-audit-review-")) throw new Error("Refusing cleanup outside owned temporary fixture");
        rmSync(actual,{ recursive:true,force:true });
      };
      cleanup();
    }
  });
});

describe("Task05 bounded database transport fixtures", () => {
  it("cancels a hung SQL exchange and destroys the stalled connection", async () => {
    const controller = new AbortController(), releases: unknown[] = [];
    const client = { query: () => new Promise(() => undefined), release: (destroy?: boolean) => { releases.push(destroy); } };
    const service = Audit.createAuditService({ ...createAppendConfig(), pool: { options:{connectionTimeoutMillis:5000}, connect: async () => client } as never, signal: controller.signal });
    const pending = service.appendReceipt(receiptInput("hung")).then(() => false, () => true);
    setTimeout(() => controller.abort(),20);
    expect(await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("unbounded"), 300))])).toBe(true);
    expect(releases).toEqual([true]);
  });
  it("times out a hung SQL exchange independently of PostgreSQL timers", async () => {
    const releases: unknown[] = [], start = Date.now();
    const client = { query: () => new Promise(() => undefined), release: (destroy?: boolean) => { releases.push(destroy); } };
    const service = Audit.createAuditService({ ...createAppendConfig(), pool: { options:{connectionTimeoutMillis:5000}, connect: async () => client } as never });
    const pending = service.appendReceipt(receiptInput("hung")).then(() => false, () => true);
    expect(await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("unbounded"), 5700))])).toBe(true);
    expect(Date.now()-start).toBeLessThan(5700);
    expect(releases).toEqual([true]);
  }, 8000);
});

describe("Task05 pool admission fixtures", () => {
  it("rejects unbounded pool acquisition configuration before connecting", () => {
    let connections=0;
    for(const timeout of [undefined,0,5001,Infinity]) {
      const fixture={ options:{connectionTimeoutMillis:timeout},connect:async()=>{connections++;throw new Error("not reached");} };
      expect(()=>Audit.createAuditService({...createAppendConfig(),pool:fixture as never})).toThrow("pool");
    }
    expect(connections).toBe(0);
  });
  it("limits outstanding audit operations across factories sharing a pool", async () => {
    let connections=0,releases=0;
    const controller=new AbortController();
    const fixture={options:{connectionTimeoutMillis:5000},connect:async()=>{connections++;return {query:()=>new Promise(()=>undefined),release(){releases++;}};}};
    const service=Audit.createAuditService({...createAppendConfig(),pool:fixture as never,signal:controller.signal});
    const pending=Array.from({length:65},()=>service.appendReceipt(receiptInput("admission")).then(()=>false,()=>true));
    setTimeout(()=>controller.abort(),20);
    expect((await Promise.all(pending)).every(Boolean)).toBe(true);
    expect(connections).toBe(64);expect(releases).toBe(64);
  });
});
