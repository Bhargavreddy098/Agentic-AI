import { describe,it,expect,beforeAll,afterAll,beforeEach } from "vitest";
import { Pool, type PoolClient } from "pg";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { createControlServices,closeControlServices } from "../src/index.js";
import type { ControlServices } from "../src/index.js";
import type { RunContext,TaskEnvelope,Checkpoint,EffectRequest,SessionEvent } from "@asi/contracts";

const url=process.env.M04_TEST_DATABASE_URL??"postgresql://postgres@127.0.0.1:60637/asi_m04_qualification";
if(!new URL(url).pathname.endsWith("_qualification"))throw new Error("Disposable qualification database required");
const schema="m04_legacy_"+randomBytes(6).toString("hex"),role="m04_legacy_role_"+randomBytes(6).toString("hex");
const options="-c search_path="+schema+",public";
const pool=new Pool({connectionString:url,options,max:2,connectionTimeoutMillis:5000,statement_timeout:5000});
let services:ControlServices;
let deadline="";
function context():RunContext {return {runId:"run-1",sessionId:"sess-1",writerEpoch:1,mode:"execute",deadlineAt:deadline,budgetRef:{tenantId:"tenant-1",accountId:"acc-1",rootRunId:"run-1"}};}
function event():SessionEvent {return {schemaVersion:1,eventId:"evt-1",tenantId:"tenant-1",sessionId:"sess-1",platform:"web",externalMessageId:"msg-1",traceId:"trace",correlationId:"correlation",causationId:"cause",principal:{tenantId:"tenant-1",subjectId:"user-1",roles:["user"],capabilities:["chat"],audience:"gateway",expiresAt:deadline,authenticatedSource:"asi-identity"},receivedAt:new Date().toISOString(),content:[{type:"text",text:"Hello"}],attachments:[]};}
function task():TaskEnvelope {return {schemaVersion:1,taskId:"task-1",traceId:"trace",correlationId:"correlation",causationId:"cause",runContext:context(),requiredCapabilities:["read"],input:{text:"test"},principalGrant:{tenantId:"tenant-1",subjectId:"worker",roles:["specialist"],capabilities:["read"],audience:"worker",expiresAt:deadline,authenticatedSource:"asi-identity"},idempotencyKey:"task-once"};}
function checkpoint():Checkpoint {return {checkpointId:"cp-1",runContext:context(),state:JSON.stringify({step:1,data:"test"}),completedTaskIds:["task-1"],completedEffectIds:[],modelResultRefs:["model-1"],version:1};}
function effect():EffectRequest {return {schemaVersion:1,effectId:"effect-1",action:"read",resource:"file",inputHash:"a".repeat(64),runContext:context(),idempotencyKey:"effect-once",traceId:"trace"};}
describe("Control integration tests — preserved obligations with reviewed M04 repairs",()=>{
 beforeAll(async()=>{
  await pool.query("CREATE SCHEMA "+schema);
  const module=await import(pathToFileURL(resolve(import.meta.dirname,"../../../scripts/apply-migrations.mjs")).href) as {applyReviewedMigrations:(client:PoolClient,options:{schema:string;target:string})=>Promise<string[]>};
  const client=await pool.connect();try{await module.applyReviewedMigrations(client,{schema,target:"M04"});}finally{client.release();}
  await pool.query("CREATE ROLE "+role+" NOLOGIN NOSUPERUSER NOBYPASSRLS");
  await pool.query("GRANT USAGE ON SCHEMA "+schema+" TO "+role);
  await pool.query("GRANT SELECT,INSERT,UPDATE,DELETE ON tenants,ingress_events,sessions,runs,writer_leases,checkpoints,outbox,effect_journal TO "+role);
  services=createControlServices({connectionString:url,options:options+" -c role="+role,max:2,connectionTimeoutMillis:5000,statement_timeout:5000},{tenantId:"tenant-1",ownerId:"legacy-owner"});
 },30000);
 afterAll(async()=>{if(services)await closeControlServices(services);await pool.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");await pool.query("DROP ROLE IF EXISTS "+role);await pool.end();});
 beforeEach(async()=>{
  await pool.query("TRUNCATE tenants CASCADE");
  deadline=new Date(Date.now()+120000).toISOString();
  await pool.query("INSERT INTO tenants(tenant_id,display_name) VALUES ('tenant-1','Test')");
  await pool.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd) VALUES ('acc-1','tenant-1','test',1000)");
  await pool.query("INSERT INTO sessions(session_id,tenant_id,principal_id,mode) VALUES ('sess-1','tenant-1','user-1','execute')");
  await pool.query("INSERT INTO runs(run_id,session_id,tenant_id,writer_epoch,mode,deadline_at,budget_account_id) VALUES ('run-1','sess-1','tenant-1',0,'execute',$1,'acc-1')",[deadline]);
 });
 describe("Ingress deduplication",()=>{
  it("accepts first event and returns duplicate=false",async()=>{expect(await services.ingress.acceptIngress(event())).toMatchObject({duplicate:false});});
  it("returns duplicate=true for same platform+externalMessageId",async()=>{const first=await services.ingress.acceptIngress(event());expect(await services.ingress.acceptIngress(event())).toEqual({acceptedId:first.acceptedId,duplicate:true});});
  it("produces one outbox item per unique ingress",async()=>{await services.ingress.acceptIngress(event());await services.ingress.acceptIngress(event());expect(await services.outbox.getPending(10)).toHaveLength(1);});
 });
 describe("Session lease with epoch fencing",()=>{
  it("claims session and increments epoch",async()=>{expect((await services.leases.claimSession("sess-1","run-1")).writerEpoch).toBe(1);});
  it("renewLease extends expiry and keeps same epoch",async()=>{const lease=await services.leases.claimSession("sess-1","run-1");const renewed=await services.leases.renewLease(lease);expect(renewed.writerEpoch).toBe(lease.writerEpoch);expect(Date.parse(renewed.expiresAt)).toBeGreaterThanOrEqual(Date.parse(lease.expiresAt));});
  it("stale epoch CAS fails on renewLease",async()=>{const lease=await services.leases.claimSession("sess-1","run-1");await expect(services.leases.renewLease({...lease,writerEpoch:lease.writerEpoch+1})).rejects.toThrow();});
  it("30-second lease takeover increases epoch",async()=>{await services.leases.claimSession("sess-1","run-1");await pool.query("UPDATE writer_leases SET expires_at=clock_timestamp()-interval '1second'");expect((await services.leases.claimSession("sess-1","run-1")).writerEpoch).toBe(2);});
 });
 describe("Outbox relay",()=>{
  it("publishes task with idempotency key",async()=>{await services.leases.claimSession("sess-1","run-1");await services.outbox.publishTask("run-1",task(),"task-once");expect(await services.outbox.getPending(10)).toMatchObject([{payloadType:"task",idempotencyKey:"task-once"}]);});
  it("duplicate idempotency key produces one logical task",async()=>{await services.leases.claimSession("sess-1","run-1");await services.outbox.publishTask("run-1",task(),"task-once");await services.outbox.publishTask("run-1",task(),"task-once");expect(await services.outbox.getPending(10)).toHaveLength(1);});
  it("outbox retry publishes one logical task ID",async()=>{await services.leases.claimSession("sess-1","run-1");await services.outbox.publishTask("run-1",task(),"task-once");const id=(await services.outbox.getPending(10))[0]!.outboxId;await services.outbox.markFailed(id,"network error");expect(await services.outbox.getPending(10)).toEqual([]);await pool.query("UPDATE outbox SET scheduled_at=clock_timestamp() WHERE outbox_id=$1",[id]);expect(await services.outbox.getPending(10)).toMatchObject([{outboxId:id,attempts:1}]);});
 });
 describe("Checkpoints",()=>{
  it("saves and retrieves checkpoint with version",async()=>{await services.leases.claimSession("sess-1","run-1");const value=checkpoint();await services.checkpoints.saveCheckpoint(value);expect(await services.checkpoints.getLatestCheckpoint("run-1")).toEqual(value);});
  // Reviewed M04 replaces the old overwrite expectation with immutable history.
  it("rejects changed data at the same version instead of overwriting history",async()=>{await services.leases.claimSession("sess-1","run-1");const value=checkpoint();await services.checkpoints.saveCheckpoint(value);await expect(services.checkpoints.saveCheckpoint({...value,state:"different"})).rejects.toThrow();expect(await services.checkpoints.getCheckpoint("run-1",1)).toEqual(value);});
 });
 describe("Effect journal",()=>{
  it("records effect intent with idempotency key",async()=>{await services.leases.claimSession("sess-1","run-1");const id=await services.effects.recordEffectIntent(effect());expect(await services.effects.getEffect(id)).toMatchObject({effectId:"effect-1",status:"planned",action:"read"});});
  it("duplicate idempotency key returns same effect ID",async()=>{await services.leases.claimSession("sess-1","run-1");expect(await services.effects.recordEffectIntent(effect())).toBe(await services.effects.recordEffectIntent(effect()));});
  it("transaction failure leaves neither inbox nor orphan dispatch",async()=>{
   await pool.query("CREATE FUNCTION legacy_deny() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$");
   await pool.query("CREATE TRIGGER legacy_deny BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION legacy_deny()");
   try{await expect(services.ingress.acceptIngress(event())).rejects.toThrow();expect((await pool.query("SELECT * FROM ingress_events")).rows).toEqual([]);expect((await pool.query("SELECT * FROM outbox")).rows).toEqual([]);}
   finally{await pool.query("DROP TRIGGER legacy_deny ON outbox");await pool.query("DROP FUNCTION legacy_deny()");}
  });
 });
});

