import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createControlServices, closeControlServices } from "../../backend/modules/control/src/index.js";
import type { ControlServices } from "../../backend/modules/control/src/index.js";
import type { RunContext, Checkpoint, EffectRequest, SessionEvent, TaskEnvelope } from "../../packages/contracts/src/index.js";

type Pool = ControlServices["pool"];
const root = resolve(import.meta.dirname, "../..");
const { Pool: DatabasePool } = createRequire(resolve(root, "backend/modules/control/package.json"))("pg") as { Pool: new (config: Record<string, unknown>) => Pool };
const url = process.env.M04_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:60637/asi_m04_qualification";
if (!new URL(url).pathname.endsWith("_qualification")) throw new Error("Disposable *_qualification database required");
const schema = `m04_control_${randomBytes(6).toString("hex")}`, role = `m04_role_${randomBytes(6).toString("hex")}`;
const options = `-c search_path=${schema},public`;
const admin = new DatabasePool({ connectionString: url, options, max: 3, statement_timeout: 5000, connectionTimeoutMillis: 5000 });
const session = "11111111-1111-4111-8111-111111111111", run = "22222222-2222-4222-8222-222222222222", secondRun = "33333333-3333-4333-8333-333333333333", account = "44444444-4444-4444-8444-444444444444";
let a: ControlServices, otherOwner: ControlServices, b: ControlServices;
let deadline = "";
function context(epoch = 1): RunContext { return { runId: run, sessionId: session, writerEpoch: epoch, mode: "execute", deadlineAt: deadline, budgetRef: { tenantId: "a", accountId: account, rootRunId: run }, goalRef: "goal-opaque", projectRef: "project-opaque", verificationRef: "verification-opaque" }; }
function checkpoint(epoch = 1): Checkpoint { return { checkpointId: "55555555-5555-4555-8555-555555555555", runContext: context(epoch), state: "state-as-text", completedTaskIds: ["66666666-6666-4666-8666-666666666666"], completedEffectIds: [], modelResultRefs: ["model-reference"], version: 1 }; }
function effect(epoch = 1): EffectRequest { return { schemaVersion: 1, effectId: "effect-opaque", action: "read", resource: "local-file", inputHash: "a".repeat(64), runContext: context(epoch), idempotencyKey: "effect-once", traceId: "trace-effect" }; }
function task(epoch = 1): TaskEnvelope { return { schemaVersion: 1, taskId: "task-opaque", traceId: "trace", correlationId: "correlation", causationId: "cause", runContext: context(epoch), requiredCapabilities: ["read"], input: { query: "safe" }, principalGrant: { tenantId: "a", subjectId: "worker", roles: ["specialist"], capabilities: ["read"], audience: "worker", expiresAt: deadline, authenticatedSource: "asi-identity" }, idempotencyKey: "task-once" }; }
function event(): SessionEvent { return { schemaVersion: 1, eventId: "event", tenantId: "a", sessionId: session, platform: "web", externalMessageId: "external-once", traceId: "trace", correlationId: "correlation", causationId: "cause", principal: { tenantId: "a", subjectId: "user", roles: ["user"], capabilities: ["chat"], audience: "gateway", expiresAt: deadline, authenticatedSource: "asi-identity" }, receivedAt: new Date().toISOString(), content: [{ type: "text", text: "Hello" }], attachments: [] }; }

describe("M04 actual PostgreSQL control qualification", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(readFileSync(resolve(root, "backend/database/migrations/postgres/001-control.sql"), "utf8"));
    await admin.query(readFileSync(resolve(root, "backend/database/migrations/postgres/009-identity-grants.sql"), "utf8"));
    // Baseline RED runs against 001/009; no absent-file or infrastructure skip.
    const forward = resolve(root, "backend/database/migrations/postgres/010-control-qualification.sql");
    if (existsSync(forward)) await admin.query(readFileSync(forward, "utf8"));
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
    const config = { connectionString: url, options: `${options} -c role=${role}`, max: 2, statement_timeout: 5000, connectionTimeoutMillis: 5000 };
    a = createControlServices(config, { tenantId: "a", ownerId: "owner-a" });
    otherOwner = createControlServices(config, { tenantId: "a", ownerId: "owner-other" });
    b = createControlServices(config, { tenantId: "b", ownerId: "owner-b" });
  }, 30000);
  afterAll(async () => {
    for (const service of [a, otherOwner, b]) if (service) await closeControlServices(service);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  });
  beforeEach(async () => {
    await admin.query("TRUNCATE tenants CASCADE");
    deadline = new Date(Date.now() + 120000).toISOString();
    await admin.query("INSERT INTO tenants(tenant_id,display_name) VALUES ('a','A'),('b','B')");
    await admin.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd) VALUES ($1,'a','test',1000)", [account]);
    await admin.query("INSERT INTO sessions(session_id,tenant_id,principal_id,mode) VALUES ($1,'a','user','execute')", [session]);
    await admin.query("INSERT INTO runs(run_id,session_id,tenant_id,mode,deadline_at,budget_account_id) VALUES ($1,$2,'a','execute',$3,$4),($5,$2,'a','execute',$3,$4)", [run, session, deadline, account, secondRun]);
  });

  it("claims a safe decoded epoch and refuses a competing live owner without changing the lease", async () => {
    const first = await a.leases.claimSession(session, run);
    expect(first.writerEpoch).toBe(1);
    await expect(otherOwner.leases.claimSession(session, secondRun)).rejects.toThrow();
    expect((await a.leases.getLease(session))?.runId).toBe(run);
    expect((await a.leases.claimSession(session, run)).writerEpoch).toBe(1);
  });
  it("a baseline live lease cannot be overwritten even when a competing claim throws", async () => {
    await admin.query("UPDATE runs SET writer_epoch=1,status='running' WHERE run_id=$1", [run]);
    const forward = existsSync(resolve(root, "backend/database/migrations/postgres/010-control-qualification.sql"));
    await admin.query(forward ? "INSERT INTO writer_leases(session_id,run_id,writer_epoch,expires_at,tenant_id,owner_id) VALUES ($1,$2,1,clock_timestamp()+interval '30seconds','a','owner-a')" : "INSERT INTO writer_leases(session_id,run_id,writer_epoch,expires_at) VALUES ($1,$2,1,clock_timestamp()+interval '30seconds')", [session, run]);
    await otherOwner.leases.claimSession(session, secondRun).catch(() => undefined);
    expect((await admin.query("SELECT run_id FROM writer_leases WHERE session_id=$1", [session])).rows[0].run_id).toBe(run);
  });
  it("release and cross-run takeover increase the session-wide epoch", async () => {
    const first = await a.leases.claimSession(session, run);
    expect(await a.leases.releaseLease(session, run, first.writerEpoch)).toBe(true);
    const second = await otherOwner.leases.claimSession(session, secondRun);
    expect(second.writerEpoch).toBe(2);
    expect(await a.leases.releaseLease(session, secondRun, second.writerEpoch)).toBe(false);
  });
  it("expired renewal cannot revive a lease and takeover fences the old writer", async () => {
    const lease = await a.leases.claimSession(session, run);
    await admin.query("UPDATE writer_leases SET expires_at=clock_timestamp()-interval '1second'");
    await expect(a.leases.renewLease(lease)).rejects.toThrow();
    const fresh = await otherOwner.leases.claimSession(session, run);
    expect(fresh.writerEpoch).toBe(2);
    await expect(a.checkpoints.saveCheckpoint(checkpoint(lease.writerEpoch))).rejects.toThrow();
    await expect(a.outbox.publishTask(run, task(lease.writerEpoch), "stale")).rejects.toThrow();
    await expect(a.effects.recordEffectIntent(effect(lease.writerEpoch))).rejects.toThrow();
  });
  it("checkpoint round-trip retains full context and immutable historical state", async () => {
    await a.leases.claimSession(session, run);
    const original = checkpoint();
    await a.checkpoints.saveCheckpoint(original);
    await a.checkpoints.saveCheckpoint(original);
    expect(await a.checkpoints.getLatestCheckpoint(run)).toEqual(original);
    await expect(a.checkpoints.saveCheckpoint({ ...original, state: "changed" })).rejects.toThrow();
    const connection = await a.pool.connect();
    try { await connection.query("BEGIN"); await connection.query("SELECT set_config('asi.tenant_id','a',true)"); await expect(connection.query("UPDATE checkpoints SET state_json='\"changed\"'")).rejects.toThrow(); } finally { await connection.query("ROLLBACK"); connection.release(); }
  });
  it("checkpoint history remains readable after deadline but cannot authorize another write", async () => {
    deadline = new Date(Date.now() + 1400).toISOString();
    await admin.query("UPDATE runs SET deadline_at=$1", [deadline]);
    await a.leases.claimSession(session, run);
    const original = checkpoint();
    await a.checkpoints.saveCheckpoint(original);
    await new Promise(resolve => setTimeout(resolve, 1500));
    expect(await a.checkpoints.getCheckpoint(run, 1)).toEqual(original);
    await expect(a.checkpoints.saveCheckpoint({ ...original, version: 2 })).rejects.toThrow();
  });
  it("cancelled and deadline-expired runs deny renewal and effect transitions", async () => {
    const lease = await a.leases.claimSession(session, run);
    const id = await a.effects.recordEffectIntent(effect());
    await admin.query("UPDATE runs SET status='cancelled' WHERE run_id=$1", [run]);
    await expect(a.leases.renewLease(lease)).rejects.toThrow();
    await expect(a.effects.authorizeEffect(id)).rejects.toThrow();
    await admin.query("UPDATE runs SET status='running',deadline_at=clock_timestamp()-interval '1second' WHERE run_id=$1", [run]);
    await expect(a.effects.authorizeEffect(id)).rejects.toThrow();
  });
  it("restricted runtime role enforces tenant RLS and transaction-local scope", async () => {
    await a.leases.claimSession(session, run);
    expect(await b.leases.getLease(session)).toBeNull();
    const connection = await b.pool.connect();
    try {
      await connection.query("BEGIN"); await connection.query("SELECT set_config('asi.tenant_id','b',true)");
      expect((await connection.query("SELECT * FROM sessions")).rows).toEqual([]);
      await expect(connection.query("INSERT INTO sessions(session_id,tenant_id,principal_id) VALUES ('cross','a','user')")).rejects.toThrow();
    } finally { await connection.query("ROLLBACK"); connection.release(); }
    const clean = await a.pool.connect();
    try { expect((await clean.query("SELECT current_setting('asi.tenant_id',true) AS scope")).rows[0].scope || "").toBe(""); } finally { clean.release(); }
  });
  it("ingress and projection commit atomically, deduplicate unchanged input and reject changed input", async () => {
    await admin.query("CREATE FUNCTION m04_deny_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture interruption'; END $$");
    await admin.query("CREATE TRIGGER m04_deny BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION m04_deny_dispatch()");
    try { await expect(a.ingress.acceptIngress(event())).rejects.toThrow(); expect((await admin.query("SELECT * FROM ingress_events")).rows).toEqual([]); } finally { await admin.query("DROP TRIGGER m04_deny ON outbox"); await admin.query("DROP FUNCTION m04_deny_dispatch()"); }
    const accepted = await a.ingress.acceptIngress(event());
    expect((await a.ingress.acceptIngress(event())).duplicate).toBe(true);
    expect((await a.outbox.getPending(10)).filter(row => row.payloadType === "ingress_projection")).toHaveLength(1);
    await expect(a.ingress.acceptIngress({ ...event(), content: [{ type: "text", text: "different" }] })).rejects.toThrow();
    expect(accepted.duplicate).toBe(false);
  });
  it("outbox survives reconnect as one immutable logical dispatch and has bounded retry", async () => {
    await a.leases.claimSession(session, run);
    await a.outbox.publishTask(run, task(), "once"); await a.outbox.publishTask(run, task(), "once");
    await expect(a.outbox.publishTask(run, { ...task(), input: { different: true } }, "once")).rejects.toThrow();
    await closeControlServices(a);
    a = createControlServices({ connectionString: url, options: `${options} -c role=${role}`, max: 2, statement_timeout: 5000, connectionTimeoutMillis: 5000 }, { tenantId: "a", ownerId: "owner-a" });
    const rows = await a.outbox.getPending(10); expect(rows).toHaveLength(1);
    expect(await otherOwner.outbox.getPending(10)).toHaveLength(1);
    const id = rows[0]!.outboxId;
    for (let attempt = 1; attempt <= 5; attempt++) {
      await a.outbox.markFailed(id, "safe transport failure");
      expect(await a.outbox.getPending(10)).toEqual([]);
      if (attempt < 5) await admin.query("UPDATE outbox SET scheduled_at=clock_timestamp() WHERE outbox_id=$1", [id]);
    }
    expect(await a.outbox.getPending(10)).toEqual([]);
    expect((await admin.query("SELECT attempts,status FROM outbox WHERE outbox_id=$1", [id])).rows[0]).toEqual({ attempts: 5, status: "dead_letter" });
  });
  it("effect intent cannot change after authorization and unknown outcome cannot blindly retry", async () => {
    await a.leases.claimSession(session, run);
    const id = await a.effects.recordEffectIntent(effect());
    expect(await a.effects.recordEffectIntent(effect())).toBe(id);
    await a.effects.authorizeEffect(id);
    await expect(a.effects.recordEffectIntent({ ...effect(), inputHash: "b".repeat(64) })).rejects.toThrow();
    await a.effects.startEffect(id); await a.effects.markUnknown(id);
    expect((await a.effects.reconcileEffect(id)).status).toBe("unknown");
    await expect(a.effects.startEffect(id)).rejects.toThrow();
    expect((await a.effects.getEffect(id))?.attempts).toBe(1);
  });
  it("opaque session/run IDs round-trip and unscoped trusted construction fails closed", async () => {
    await admin.query("INSERT INTO sessions(session_id,tenant_id,principal_id) VALUES ('session-opaque','a','user')");
    await admin.query("INSERT INTO runs(run_id,session_id,tenant_id,deadline_at) VALUES ('run-opaque','session-opaque','a',$1)", [deadline]);
    expect((await a.leases.claimSession("session-opaque", "run-opaque")).sessionId).toBe("session-opaque");
    expect(() => createControlServices({ connectionString: url })).toThrow();
  });
  it("root budget context cannot be rebound to an unrelated run", async () => {
    await a.leases.claimSession(session, run);
    const forged = checkpoint();
    forged.runContext.budgetRef.rootRunId = secondRun;
    await expect(a.checkpoints.saveCheckpoint(forged)).rejects.toThrow();
  });
  it("pending stale-epoch dispatch is withheld after takeover", async () => {
    await a.leases.claimSession(session, run);
    await a.outbox.publishTask(run, task(), "stale-dispatch");
    await admin.query("UPDATE writer_leases SET expires_at=clock_timestamp()-interval '1second'");
    await otherOwner.leases.claimSession(session, run);
    expect(await a.outbox.getPending(10)).toEqual([]);
  });
  it("SQL runtime role cannot rewrite an authorized digest", async () => {
    await a.leases.claimSession(session, run);
    const id = await a.effects.recordEffectIntent(effect());
    await a.effects.authorizeEffect(id);
    const connection = await a.pool.connect();
    try {
      await connection.query("BEGIN"); await connection.query("SELECT set_config('asi.tenant_id','a',true),set_config('asi.owner_id','owner-a',true)");
      await expect(connection.query("UPDATE effect_journal SET input_hash=$1 WHERE effect_id=$2", [Buffer.from("b".repeat(64), "hex"), id])).rejects.toThrow();
    } finally { await connection.query("ROLLBACK"); connection.release(); }
  });
  it.each(["renew", "release"] as const)("%s rechecks server time after waiting for an unchanged locked lease", async operation => {
    const lease = await a.leases.claimSession(session, run);
    await admin.query("UPDATE writer_leases SET expires_at=clock_timestamp()+interval '1second'");
    const blocker = await admin.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT * FROM writer_leases FOR UPDATE");
      const pending = operation === "renew"
        ? a.leases.renewLease(lease).then(() => false, () => true)
        : a.leases.releaseLease(session, run, lease.writerEpoch).then(released => !released);
      await blocker.query("SELECT pg_sleep(1.2)"); await blocker.query("COMMIT");
      expect(await pending).toBe(true);
      expect((await admin.query("SELECT expires_at<clock_timestamp() AS expired FROM writer_leases")).rows[0]?.expired).toBe(true);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  it("simultaneous claims leave exactly one live owner", async () => {
    const claims = await Promise.allSettled([a.leases.claimSession(session, run), otherOwner.leases.claimSession(session, secondRun)]);
    expect(claims.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter(result => result.status === "rejected")).toHaveLength(1);
    const stored = (await admin.query("SELECT owner_id,writer_epoch FROM writer_leases")).rows[0];
    expect(["owner-a", "owner-other"]).toContain(stored.owner_id);
    expect(stored.writer_epoch).toBe("1");
  });
  it("releasing an unclaimed run returns false without treating epoch zero as corrupt", async () => {
    expect(await a.leases.releaseLease(session, run, 1)).toBe(false);
  });
  it("epoch overflow denies takeover without mutating canonical state", async () => {
    await admin.query("UPDATE sessions SET writer_epoch=9007199254740991");
    await expect(a.leases.claimSession(session, run)).rejects.toThrow("integer");
    expect((await admin.query("SELECT writer_epoch FROM sessions")).rows[0].writer_epoch).toBe("9007199254740991");
    expect((await admin.query("SELECT * FROM writer_leases")).rows).toEqual([]);
  });
  it.each(["budget", "parent"] as const)("canonical run cannot reference another tenant's %s", async reference => {
    await admin.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd) VALUES ('b-budget','b','B',1000)");
    await admin.query("INSERT INTO sessions(session_id,tenant_id,principal_id) VALUES ('b-session','b','b-user')");
    await admin.query("INSERT INTO runs(run_id,session_id,tenant_id,deadline_at,budget_account_id) VALUES ('b-run','b-session','b',$1,'b-budget')", [deadline]);
    const client = await a.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('asi.tenant_id','a',true)");
      await expect(client.query("INSERT INTO runs(run_id,session_id,tenant_id,deadline_at,budget_account_id,parent_run_id) VALUES ('cross-reference',$1,'a',$2,$3,$4)", [session, deadline, reference === "budget" ? "b-budget" : account, reference === "parent" ? "b-run" : null])).rejects.toThrow();
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("claim does not admit a run after an unchanged run-lock wait passes its deadline", async () => {
    await admin.query("UPDATE runs SET deadline_at=clock_timestamp()+interval '1second' WHERE run_id=$1", [run]);
    const blocker = await admin.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT * FROM runs WHERE run_id=$1 FOR UPDATE", [run]);
      const pending = a.leases.claimSession(session, run).then(() => false, () => true);
      await blocker.query("SELECT pg_sleep(1.2)"); await blocker.query("COMMIT");
      expect(await pending).toBe(true);
      expect((await admin.query("SELECT * FROM writer_leases")).rows).toEqual([]);
      expect((await admin.query("SELECT writer_epoch,status FROM runs WHERE run_id=$1", [run])).rows[0]).toEqual({ writer_epoch: "0", status: "accepted" });
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  it("same-owner claim rechecks live expiry after an unchanged lease-lock wait", async () => {
    await a.leases.claimSession(session, run);
    await admin.query("UPDATE writer_leases SET expires_at=clock_timestamp()+interval '1second'");
    const blocker = await admin.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT * FROM writer_leases FOR UPDATE");
      const pending = a.leases.claimSession(session, run);
      await blocker.query("SELECT pg_sleep(1.2)"); await blocker.query("COMMIT");
      expect((await pending).writerEpoch).toBe(2);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
});
