// Approved Task06: real PostgreSQL qualification, replacing query-order mocks with accounting/authority evidence.
import { createPostgresFixturePool, type PostgresFixturePool as Pool } from "../../backend/modules/control/test/fixtures/postgres.js";
type PoolClient = Parameters<Parameters<Pool["connect"]>[0]>[1];
import { describe,it,expect,beforeAll,afterAll,beforeEach,vi } from "vitest";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createBudgetService,createBudgetReconciler,reserveBudget,getReservation,settleBudget,releaseBudget,getSelfState,getBudgetSnapshot,getSettledForRun,type BudgetConfig,type BudgetQuotas } from "../../backend/modules/budgets/src/index.js";
import type { RunContext } from "@asi/contracts";
const url=process.env['B06_TEST_DATABASE_URL'];
if(!url||!new URL(url).pathname.endsWith('_qualification')||!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw new Error('Explicit local disposable B06_TEST_DATABASE_URL required');
const id=randomBytes(6).toString('hex'),schema='b06_'+id,role='b06_writer_'+id,billingRole='b06_billing_'+id;
const options='-c search_path='+schema+',public';
const admin=createPostgresFixturePool({connectionString:url,options,max:4,connectionTimeoutMillis:5000,statement_timeout:5000});
let pool:Pool,billing:Pool,deadline:string;
const legacy=schema+'_legacy';
let migrate:(client:PoolClient,options:{schema:string;target:string})=>Promise<string[]>;
const quotas:BudgetQuotas={accountTokens:1000,accountCostMicroUsd:1000,tenantTokens:1500,tenantCostMicroUsd:1500};
function context(run='root',account='account',tenant='tenant'):RunContext {
 return {runId:run,sessionId:'session-'+run,writerEpoch:1,mode:'execute',deadlineAt:deadline,budgetRef:{tenantId:tenant,accountId:account,rootRunId:run==='child'?'root':run},...(run==='child'?{parentRunId:'root'}:{})};
}
function config(operation='operation',ctx=context(),values=quotas):BudgetConfig {return {pool,trustedScope:{tenantId:ctx.budgetRef.tenantId,ownerId:'owner',context:ctx,operationKey:operation,quotas:values}};}
async function seedRun(run:string,account='account',tenant='tenant',parent:string|null=null) {
 await admin.query("INSERT INTO sessions(session_id,tenant_id,principal_id,mode,writer_epoch) VALUES($1,$2,'user','execute',1)",['session-'+run,tenant]);
 await admin.query("INSERT INTO runs(run_id,session_id,tenant_id,writer_epoch,mode,status,deadline_at,budget_account_id,parent_run_id) VALUES($1,$2,$3,1,'execute','running',$4,$5,$6)",[run,'session-'+run,tenant,deadline,account,parent]);
 await admin.query("INSERT INTO writer_leases(session_id,run_id,tenant_id,writer_epoch,owner_id,expires_at) VALUES($1,$2,$3,1,'owner',$4)",['session-'+run,run,tenant,deadline]);
}
async function service(operation='operation',ctx=context(),values=quotas) {return createBudgetService(config(operation,ctx,values));}
async function reserve(operation='operation',tokens=100,cost=100) {const s=await service(operation);return {s,r:await s.reserveBudget(context().budgetRef,tokens,cost)};}
async function charge() {const row=(await admin.query<{tokens:string;cost:string}>("SELECT charged_tokens::text AS tokens,current_spend_micro_usd::text AS cost FROM budget_accounts WHERE account_id='account'")).rows[0]!;return {tokens:Number(row.tokens),cost:Number(row.cost)};}
async function cancel() {await admin.query("UPDATE runs SET status='cancelled' WHERE run_id='root'");}

beforeAll(async()=>{
 // Install extension in public of this wholly disposable database; both schemas resolve the same official functions.
 await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
 await admin.query('CREATE SCHEMA '+legacy);
 await admin.query('CREATE SCHEMA '+schema);
 const module=await import(pathToFileURL(resolve('scripts/apply-migrations.mjs')).href) as {applyReviewedMigrations:typeof migrate};migrate=module.applyReviewedMigrations;
 const legacyClient=await admin.connect();try{await migrate(legacyClient,{schema:legacy,target:'M04'});await legacyClient.query('SET search_path TO '+legacy+',public');await legacyClient.query("INSERT INTO tenants(tenant_id,display_name) VALUES('legacy','Legacy')");await legacyClient.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd,current_spend_micro_usd) VALUES('legacy','legacy','Legacy',1000,30)");}finally{await legacyClient.query('SET search_path TO '+schema+',public');legacyClient.release();}
 const client=await admin.connect();try{await migrate(client,{schema,target:'06'});}finally{client.release();}
 await admin.query('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOBYPASSRLS');await admin.query('CREATE ROLE '+billingRole+' NOLOGIN NOSUPERUSER NOBYPASSRLS');
 for(const name of [role,billingRole]){await admin.query('GRANT USAGE ON SCHEMA '+schema+' TO '+name);await admin.query('GRANT SELECT ON tenant_budget_limits,budget_accounts,budget_reservations TO '+name);}
 await admin.query('GRANT EXECUTE ON FUNCTION b06_reserve(jsonb,text,bigint,bigint),b06_write(jsonb,text,text,bigint,bigint,jsonb),b06_state(jsonb),b06_history(jsonb),b06_lookup(jsonb,text) TO '+role);
 await admin.query('GRANT EXECUTE ON FUNCTION b06_reconcile(text,text,bigint,bigint,jsonb) TO '+billingRole);
 pool=createPostgresFixturePool({connectionString:url,options:options+' -c role='+role,max:20,connectionTimeoutMillis:5000,statement_timeout:5000});
 billing=createPostgresFixturePool({connectionString:url,options:options+' -c role='+billingRole,max:2,connectionTimeoutMillis:5000,statement_timeout:5000});
},30000);
afterAll(async()=>{
 await admin.query('DROP SCHEMA IF EXISTS '+legacy+' CASCADE');
 await pool?.end();await billing?.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.query('DROP ROLE IF EXISTS '+role);await admin.query('DROP ROLE IF EXISTS '+billingRole);await admin.end();
});
beforeEach(async()=>{
 // Each case gets a fresh synthetic schema; append-only history enforcement stays enabled.
 await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.query('CREATE SCHEMA '+schema);
 const migrationClient=await admin.connect();try{await migrate(migrationClient,{schema,target:'06'});}finally{migrationClient.release();}
 for(const name of [role,billingRole]){await admin.query('GRANT USAGE ON SCHEMA '+schema+' TO '+name);await admin.query('GRANT SELECT ON tenant_budget_limits,budget_accounts,budget_reservations TO '+name);}
 await admin.query('GRANT EXECUTE ON FUNCTION b06_reserve(jsonb,text,bigint,bigint),b06_write(jsonb,text,text,bigint,bigint,jsonb),b06_state(jsonb),b06_history(jsonb),b06_lookup(jsonb,text) TO '+role);
 await admin.query('GRANT EXECUTE ON FUNCTION b06_reconcile(text,text,bigint,bigint,jsonb) TO '+billingRole);
 deadline=new Date(Date.now()+120000).toISOString();
 await admin.query("INSERT INTO tenants(tenant_id,display_name) VALUES('tenant','Budget fixture'),('other','Other fixture')");
 await admin.query("INSERT INTO tenant_budget_limits(tenant_id,token_limit,cost_limit_micro_usd) VALUES('tenant',1500,1500),('other',1000,1000)");
 await admin.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd,token_limit) VALUES('account','tenant','main',1000,1000),('second','tenant','second',1000,1000),('foreign','other','foreign',1000,1000)");
 await seedRun('root');await seedRun('child','account','tenant','root');await seedRun('second-root','second');await seedRun('other-root','foreign','other');
});

describe('Shared budget authority and atomic conservation',()=>{
 it('20 concurrent admissions cannot exceed exactly 1000 micro-USD',async()=>{
  const outcomes=await Promise.allSettled(Array.from({length:20},(_,i)=>reserve('op-'+i,100,100)));
  expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(10);expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(10);expect(await charge()).toEqual({tokens:1000,cost:1000});
 });
 it('returns original reservation for concurrent duplicate immutable operation',async()=>{
  const values=await Promise.all(Array.from({length:20},()=>reserve()));expect(new Set(values.map(v=>v.r.reservationId)).size).toBe(1);expect(await charge()).toEqual({tokens:100,cost:100});
 });
 it('rejects conflicting duplicate bounds without charging twice',async()=>{await reserve();await expect(reserve('operation',101,100)).rejects.toThrow(/conflict/i);expect(await charge()).toEqual({tokens:100,cost:100});});
 it('token exhaustion blocks even when cost capacity remains',async()=>{await reserve('full-tokens',1000,1);await expect(reserve('more',1,1)).rejects.toThrow(/exhausted/i);expect(await charge()).toEqual({tokens:1000,cost:1});});
 it('child usage debits the same root account and tenant',async()=>{
  await reserve('parent',600,600);const child=await service('child',context('child'));await child.reserveBudget(context('child').budgetRef,400,400);await expect(reserve('parent-more',1,1)).rejects.toThrow();expect(await charge()).toEqual({tokens:1000,cost:1000});
 });
 it('aggregate tenant limit applies across distinct accounts',async()=>{
  await reserve('first',900,900);const second=await service('second',context('second-root','second'));await expect(second.reserveBudget(context('second-root','second').budgetRef,700,700)).rejects.toThrow();await second.reserveBudget(context('second-root','second').budgetRef,600,600);expect((await admin.query("SELECT charged_cost_micro_usd::text AS cost FROM tenant_budget_limits WHERE tenant_id='tenant'")).rows[0]?.cost).toBe('1500');
 });
 it('preserves root identity on lookup and returns null for unknown reservation',async()=>{
  const {s,r}=await reserve();expect(await s.getReservation(r.reservationId)).toEqual(r);expect((await s.getReservation(r.reservationId))?.budgetRef.rootRunId).toBe('root');expect(await s.getReservation('missing')).toBeNull();
 });
 it('settlement records actual usage once and rejects changed usage or proof',async()=>{
  const {s,r}=await reserve();await s.markDispatched(r.reservationId);await s.settleBudget(r.reservationId,40,30,{bill:'one'});await s.settleBudget(r.reservationId,40,30,{bill:'one'});expect(await charge()).toEqual({tokens:40,cost:30});await expect(s.settleBudget(r.reservationId,41,30,{bill:'one'})).rejects.toThrow(/conflict/i);await expect(s.settleBudget(r.reservationId,40,30,{bill:'different'})).rejects.toThrow(/conflict/i);
 });
 it('requires dispatch evidence before settlement',async()=>{const {s,r}=await reserve();await expect(s.settleBudget(r.reservationId,30,30)).rejects.toThrow(/dispatched/i);expect(await charge()).toEqual({tokens:100,cost:100});});
 it('held release refunds once, returns null and cannot resurrect authority',async()=>{
  const {s,r}=await reserve();await s.releaseBudget(r.reservationId,'cancelled before handoff');await s.releaseBudget(r.reservationId,'repeat cleanup');expect(await charge()).toEqual({tokens:0,cost:0});expect(await s.getReservation(r.reservationId)).toBeNull();await expect(reserve()).rejects.toThrow();await expect(s.markDispatched(r.reservationId)).rejects.toThrow();
 });
 it('dispatched and unknown calls retain conservative charges',async()=>{
  const {s,r}=await reserve();await s.markDispatched(r.reservationId);await expect(s.releaseBudget(r.reservationId,'cancel')).rejects.toThrow();await s.markUnknown(r.reservationId);await expect(s.releaseBudget(r.reservationId,'cancel')).rejects.toThrow();expect(await s.getReservation(r.reservationId)).toMatchObject({status:'unknown'});expect(await charge()).toEqual({tokens:100,cost:100});
 });
 it('getSelfState subtracts charged counters once and reports token/cost degradation',async()=>{
  const {s}=await reserve('state',100,100);const state=await s.getSelfState(context());expect(state).toMatchObject({remainingTokens:900,remainingCostMicroUsd:900});expect(state.degradedCapabilities).toContain('cost-intensive-operations');
 });
 it('over-budget admission never initiates provider/tool handoff',async()=>{
  const network=vi.fn();const s=await service();await expect((async()=>{const r=await s.reserveBudget(context().budgetRef,1001,1001);await s.markDispatched(r.reservationId);network();})()).rejects.toThrow();expect(network).not.toHaveBeenCalled();expect(await charge()).toEqual({tokens:0,cost:0});
 });
 it('rejects missing and mismatched explicit deployment quotas at startup',async()=>{
  await expect(createBudgetService({pool})).rejects.toThrow(/trusted/i);await expect(service('op',context(),{...quotas,accountTokens:999})).rejects.toThrow(/quota mismatch/i);await admin.query("DELETE FROM tenant_budget_limits WHERE tenant_id='tenant'");await expect(service()).rejects.toThrow(/missing tenant/i);
 });
 it.each([-1,0.5,Number.MAX_SAFE_INTEGER+1,Infinity,NaN])('rejects invalid quantity %s without changing counters',async n=>{const s=await service();await expect(s.reserveBudget(context().budgetRef,n,1)).rejects.toThrow();await expect(s.reserveBudget(context().budgetRef,1,n)).rejects.toThrow();expect(await charge()).toEqual({tokens:0,cost:0});});
 it('handles safe BIGINT bounds at MAX_SAFE_INTEGER without concatenation',async()=>{
  const max=Number.MAX_SAFE_INTEGER;await admin.query("UPDATE budget_accounts SET token_limit=$1,monthly_limit_micro_usd=$1 WHERE account_id='account'",[max]);await admin.query("UPDATE tenant_budget_limits SET token_limit=$1,cost_limit_micro_usd=$1 WHERE tenant_id='tenant'",[max]);const s=await service('max',context(),{accountTokens:max,accountCostMicroUsd:max,tenantTokens:max,tenantCostMicroUsd:max});await s.reserveBudget(context().budgetRef,max,max);expect(await s.getSelfState(context())).toMatchObject({remainingTokens:0,remainingCostMicroUsd:0});
 });
 it('overrun retains actual bill and suspends both account and tenant',async()=>{
  const {s,r}=await reserve();await s.markDispatched(r.reservationId);await s.settleBudget(r.reservationId,1200,1300,{bill:'overrun'});expect(await charge()).toEqual({tokens:1200,cost:1300});expect(await s.getSelfState(context())).toMatchObject({remainingTokens:0,remainingCostMicroUsd:0,degradedCapabilities:['budget-suspended']});await expect(reserve('next',1,1)).rejects.toThrow(/suspended/i);
 });
 it('negative/overflow actual usage cannot alter stored accounting',async()=>{const {s,r}=await reserve();await s.markDispatched(r.reservationId);await expect(s.settleBudget(r.reservationId,-1,0)).rejects.toThrow();await expect(s.settleBudget(r.reservationId,1,Number.MAX_SAFE_INTEGER+1)).rejects.toThrow();expect(await charge()).toEqual({tokens:100,cost:100});});
 it('rejects stale writer, changed authority and forged roots',async()=>{
  await expect(service('old',{...context(),writerEpoch:2})).rejects.toThrow();await expect(service('forged',{...context(),budgetRef:{...context().budgetRef,rootRunId:'other-root'}})).rejects.toThrow();await expect(service('wrong-session',{...context(),sessionId:'session-child'})).rejects.toThrow();await expect(service('wrong-account',{...context(),budgetRef:{...context().budgetRef,accountId:'foreign'}})).rejects.toThrow();expect(await charge()).toEqual({tokens:0,cost:0});
 });
 it('cancellation before dispatch denies handoff; restricted cleanup releases held funds',async()=>{
  const {s,r}=await reserve();await cancel();await expect(s.markDispatched(r.reservationId)).rejects.toThrow();await expect(s.releaseBudget(r.reservationId,'cancel')).rejects.toThrow();const reconciler=await createBudgetReconciler({pool:billing,tenantId:'tenant',ownerId:'billing'});await reconciler.releaseBudget(r.reservationId,'cancel before dispatch');expect(await charge()).toEqual({tokens:0,cost:0});
 });
 it('cancelled unknown calls require restricted billing reconciliation, not release',async()=>{
  const {s,r}=await reserve();await s.markDispatched(r.reservationId);await s.markUnknown(r.reservationId);await cancel();await expect(s.settleBudget(r.reservationId,40,30)).rejects.toThrow();const reconciler=await createBudgetReconciler({pool:billing,tenantId:'tenant',ownerId:'billing'});await expect(reconciler.releaseBudget(r.reservationId,'cancel')).rejects.toThrow();await reconciler.settleBudget(r.reservationId,40,30,{bill:'confirmed'});expect(await charge()).toEqual({tokens:40,cost:30});
 });
 it('normal runtime role cannot construct billing reconciler or mutate counters/bounds',async()=>{
  const {r}=await reserve();await expect(createBudgetReconciler({pool,tenantId:'tenant',ownerId:'owner'})).rejects.toThrow(/billing/i);await expect(pool.query("UPDATE budget_accounts SET current_spend_micro_usd=0")).rejects.toThrow(/permission denied/i);await expect(pool.query("UPDATE budget_reservations SET reserved_tokens=0 WHERE reservation_id=$1",[r.reservationId])).rejects.toThrow(/permission denied/i);await expect(admin.query("UPDATE budget_reservations SET reserved_tokens=0 WHERE reservation_id=$1",[r.reservationId])).rejects.toThrow(/immutable/i);
 });
 it('runtime-role FORCE RLS hides foreign tenant records',async()=>{
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('asi.tenant_id','tenant',true)");expect((await client.query("SELECT * FROM budget_accounts WHERE tenant_id='other'")).rows).toEqual([]);expect((await client.query("SELECT * FROM tenant_budget_limits WHERE tenant_id='other'")).rows).toEqual([]);await client.query('COMMIT');}finally{client.release();}
 });
 it('billing cannot admit or dispatch and cannot reconcile a different tenant',async()=>{
  const {r}=await reserve();const client=await billing.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('asi.tenant_id','tenant',true)");await expect(client.query("SELECT b06_reserve($1::jsonb,'forbidden',1,1)",[JSON.stringify(context())])).rejects.toThrow(/permission denied/i);await client.query('ROLLBACK');}finally{client.release();}const foreign=await createBudgetReconciler({pool:billing,tenantId:'other',ownerId:'billing'});await expect(foreign.releaseBudget(r.reservationId,'foreign')).rejects.toThrow(/unknown/i);expect(await charge()).toEqual({tokens:100,cost:100});
 });
 it('rechecks lease expiry after waiting for tenant/account locks',async()=>{
  const s=await service();await admin.query("UPDATE writer_leases SET expires_at=clock_timestamp()+interval '200 milliseconds' WHERE run_id='root'");const lock=await admin.connect();try{await lock.query('BEGIN');await lock.query("SELECT 1 FROM tenant_budget_limits WHERE tenant_id='tenant' FOR UPDATE");const pending=s.reserveBudget(context().budgetRef,100,100);const observed=expect(pending).rejects.toThrow(/expired|inactive|stale/i);await lock.query('SELECT pg_sleep(0.4)');await lock.query('COMMIT');await observed;}finally{await lock.query('ROLLBACK');lock.release();}expect(await charge()).toEqual({tokens:0,cost:0});
 });
 it('transaction rollback undoes both counters on failed journal insert',async()=>{
  const s=await service();await admin.query("CREATE FUNCTION b06_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$");await admin.query('CREATE TRIGGER b06_fixture_failure BEFORE INSERT ON budget_reservations FOR EACH ROW EXECUTE FUNCTION b06_fixture_failure()');try{await expect(s.reserveBudget(context().budgetRef,100,100)).rejects.toThrow(/rollback/i);expect(await charge()).toEqual({tokens:0,cost:0});expect((await admin.query('SELECT * FROM budget_reservations')).rows).toEqual([]);}finally{await admin.query('DROP TRIGGER b06_fixture_failure ON budget_reservations');await admin.query('DROP FUNCTION b06_fixture_failure()');}
 });
 it('config-first adapters retain planned successful reserve/lookup/settle/snapshot obligations',async()=>{
  const cfg=config();const result=await reserveBudget(cfg,{budgetRef:context().budgetRef,tokens:100,maxCostMicroUsd:100,runId:'root'});expect(await getReservation(cfg,{reservationId:result.reservation.reservationId,tenantId:'tenant'})).toEqual(result.reservation);const s=await createBudgetService(cfg);await s.markDispatched(result.reservation.reservationId);await settleBudget(cfg,{reservationId:result.reservation.reservationId,tenantId:'tenant',actualTokens:40,actualCostMicroUsd:30});expect((await getSettledForRun(cfg,{tenantId:'tenant',runId:'root'}))[0]).toMatchObject({actualTokens:40,actualCostMicroUsd:30});expect(await getSelfState(cfg,context())).toMatchObject({remainingTokens:960,remainingCostMicroUsd:970});expect(await getBudgetSnapshot(cfg,context().budgetRef)).toMatchObject({accountId:'account',currentSpendMicroUsd:30,activeReservations:[],settledReservations:[{settledTokens:40,settledCostMicroUsd:30}]});await expect(releaseBudget(cfg,{reservationId:result.reservation.reservationId,tenantId:'tenant',reason:'already billed'})).rejects.toThrow();
 });
 it('new Node process observes durable unknown reservation without replacement or recharge',async()=>{
  const {s,r}=await reserve();await s.markDispatched(r.reservationId);await s.markUnknown(r.reservationId);
  const script=`import {Pool} from 'pg';import {createBudgetService} from './backend/modules/budgets/dist/index.js';const pool=new Pool({connectionString:process.env.B06_TEST_DATABASE_URL,options:process.env.B06_OPTIONS});try{const scope=JSON.parse(process.env.B06_SCOPE);const s=await createBudgetService({pool,trustedScope:scope});const r=await s.getReservation(process.env.B06_ID);if(r?.status!=='unknown')throw Error('durable unknown missing');const again=await s.reserveBudget(scope.context.budgetRef,100,100);if(again.reservationId!==r.reservationId)throw Error('replacement');process.stdout.write('durable-unknown-ok');}finally{await pool.end();}`;
  const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,B06_TEST_DATABASE_URL:url,B06_OPTIONS:options+' -c role='+role,B06_SCOPE:JSON.stringify(config().trustedScope),B06_ID:r.reservationId},timeout:10000});expect(result.stdout).toBe('durable-unknown-ok');expect(await charge()).toEqual({tokens:100,cost:100});
 });
});

it('bounds complete history reads while admission/state and direct lookup remain usable',async()=>{
 await admin.query("INSERT INTO budget_reservations(reservation_id,account_id,tenant_id,run_id,root_run_id,writer_epoch,operation_key,reserved_tokens,reserved_cost_micro_usd,status,settled_at) SELECT 'history-'||n,'account','tenant','root','root',1,'history-'||n,0,0,'released',clock_timestamp() FROM generate_series(1,1001) n");
 const s=await service();expect(await s.getSelfState(context())).toMatchObject({remainingTokens:1000,remainingCostMicroUsd:1000});expect(await s.getReservation('history-1')).toBeNull();await expect(s.snapshot()).rejects.toThrow(/bounded history/i);const r=await s.reserveBudget(context().budgetRef,1,1);expect(r.status).toBe('reserved');
});
// Additional reviewed boundary cases: database privilege, expiry, migration halt and exact overrun accounting.
it('private SQL helpers cannot be invoked as an alternate billing or counter path',async()=>{
 await expect(pool.query("SELECT b06_change(NULL,'x','release',NULL,NULL,NULL,true)")).rejects.toThrow(/permission denied/i);
 await expect(pool.query("SELECT b06_reconcile('x','release',NULL,NULL,NULL)")).rejects.toThrow(/permission denied/i);
});
it('SQL entry points reject partially specified canonical contexts',async()=>{
 const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('asi.tenant_id','tenant',true),set_config('asi.owner_id','owner',true)");const forged={...context()} as Partial<RunContext>;delete forged.deadlineAt;await expect(client.query("SELECT b06_reserve($1::jsonb,'partial',1,1)",[JSON.stringify(forged)])).rejects.toThrow(/canonical/i);await client.query('ROLLBACK');}finally{client.release();}expect(await charge()).toEqual({tokens:0,cost:0});
});
it('expired writers cannot close usage but trusted billing reconciliation can',async()=>{
 const {s,r}=await reserve();await s.markDispatched(r.reservationId);await admin.query("UPDATE runs SET deadline_at=clock_timestamp()-interval '1 second' WHERE run_id='root'");await expect(s.settleBudget(r.reservationId,40,30)).rejects.toThrow(/expired|inactive|stale/i);const reconciler=await createBudgetReconciler({pool:billing,tenantId:'tenant',ownerId:'billing'});await reconciler.settleBudget(r.reservationId,40,30,{bill:'after-expiry'});expect(await charge()).toEqual({tokens:40,cost:30});
});
it('retains aggregate actual bills above JavaScript safe maximum without rounding',async()=>{
 const first=await reserve('first',1,1),second=await reserve('second',1,1);await first.s.markDispatched(first.r.reservationId);await second.s.markDispatched(second.r.reservationId);const max=Number.MAX_SAFE_INTEGER;await first.s.settleBudget(first.r.reservationId,max,max,{bill:'one'});await second.s.settleBudget(second.r.reservationId,max,max,{bill:'two'});const row=(await admin.query("SELECT current_spend_micro_usd::text AS cost FROM budget_accounts WHERE account_id='account'")).rows[0];expect(row?.cost).toBe((BigInt(max)*2n).toString());expect(await first.s.getSelfState(context())).toMatchObject({remainingTokens:0,remainingCostMicroUsd:0});await expect(getBudgetSnapshot(config(),context().budgetRef)).rejects.toThrow(/quantity/i);
});
it('015 halts on populated legacy budgets without rewriting original spend',async()=>{
 // Both legacy data and extension namespaces are synthetic and live only in the disposable qualification database.
 const client=await admin.connect();try{await client.query('SET search_path TO '+legacy+',public');await expect(migrate(client,{schema:legacy,target:'06'})).rejects.toThrow(/populated/i);expect((await client.query('SELECT current_spend_micro_usd::text AS cost FROM budget_accounts')).rows[0]?.cost).toBe('30');expect((await client.query("SELECT to_regclass($1) AS name",[legacy+'.tenant_budget_limits'])).rows[0]?.name).toBeNull();}finally{await client.query('SET search_path TO '+schema+',public');client.release();}
});
