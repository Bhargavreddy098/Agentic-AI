import { createPostgresFixturePool } from "../../backend/modules/control/test/fixtures/postgres.js";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { EffectRequest, Principal } from "@asi/contracts";
import { configureIdentity, createPrincipalToken, verifyPrincipal, setGrantStore, PostgresGrantStore, revokeGrant, parseGrantId, requireAuthenticatedPrincipal } from "@asi/identity";
import { delegatePrincipal } from '@asi/identity';

const url = process.env['B07_TEST_DATABASE_URL'];
if (!url || !new URL(url).pathname.endsWith('_qualification') || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new Error('Explicit local disposable B07_TEST_DATABASE_URL required');
const id = randomBytes(6).toString('hex'), schema = 'p07_' + id, role = 'p07_writer_' + id;
const options = '-c search_path=' + schema + ',public';
const admin = createPostgresFixturePool({ connectionString: url, options, max: 4, statement_timeout: 5000 });
type FixtureClient = NonNullable<Parameters<Parameters<typeof admin.connect>[0]>[1]>;
let pool: ReturnType<typeof createPostgresFixturePool>;
let migrate: (client: FixtureClient, options: { schema: string; target: string }) => Promise<string[]>;
let request: EffectRequest, principal: Principal, record: Record<string, unknown>;
let user: Principal, human: Principal, userToken: string;
const signature = 'ab'.repeat(32), decisionSignature = 'cd'.repeat(32);
const functions = 'p07_authorize(jsonb,jsonb),p07_requester(jsonb,jsonb),p07_bind(jsonb,jsonb),p07_create(jsonb,jsonb,jsonb,text),p07_decide(jsonb,text,text,jsonb,text),p07_consume(jsonb,jsonb,text,text,text),p07_get(jsonb,text),p07_list(jsonb),p07_expire(jsonb),p07_check(jsonb,jsonb)';
async function tx<T>(work: (client: FixtureClient) => Promise<T>, tenant = 'tenant', owner = 'owner'): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); await c.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id',$2,true)", [tenant, owner]); const value = await work(c); await c.query('COMMIT'); return value; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
async function create() { return tx(c => c.query('SELECT p07_create($1,$2,$3,$4)', [request.runContext, request, record, signature])); }
function decision(actor = 'human') { return { approvalId: 'approval', nonce: 'nonce', decision: 'approve', actor: {...record['approver'] as Record<string,unknown>, principal: { ...human, subjectId: actor } }, decidedAt: new Date().toISOString(), requestSignature: signature }; }
async function approve(actor = 'human', nonce = 'nonce') { return tx(c => c.query('SELECT p07_decide($1,$2,$3,$4,$5)', [request.runContext, 'approval', nonce, decision(actor), decisionSignature])); }
async function consume(r = request) { return tx(c => c.query('SELECT p07_consume($1,$2,$3,$4,$5)', [r.runContext, r, 'approval', 'nonce', decisionSignature])); }

beforeAll(async () => {
  await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  await admin.query('CREATE ROLE ' + role + ' NOLOGIN NOSUPERUSER NOBYPASSRLS');
  const module = await import(pathToFileURL(resolve('scripts/apply-migrations.mjs')).href) as { applyReviewedMigrations: typeof migrate };
  migrate = module.applyReviewedMigrations;
  pool = createPostgresFixturePool({ connectionString: url, options: options + ' -c role=' + role, max: 12, statement_timeout: 5000 });
});
afterAll(async () => { await pool?.end(); await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); await admin.query('DROP ROLE IF EXISTS ' + role); await admin.end(); });
beforeEach(async () => {
  await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); await admin.query('CREATE SCHEMA ' + schema);
  const c = await admin.connect(); try { await migrate(c, { schema, target: '07' }); } finally { c.release(); }
  await admin.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + role);
  await admin.query('GRANT SELECT ON approvals TO ' + role);
  await admin.query('GRANT EXECUTE ON FUNCTION ' + functions + ' TO ' + role);
  const deadline = new Date(Date.now() + 120000).toISOString();
  principal = { tenantId: 'tenant', subjectId: 'user', roles: ['user'], capabilities: ['invoke:tool'], audience: 'policy-kernel', expiresAt: deadline, authenticatedSource: 'asi-identity' };
  request = { schemaVersion: 1, effectId: 'effect', action: 'tool:invoke', resource: 'tool:search', inputHash: '01'.repeat(32), artifactHash: '02'.repeat(32), idempotencyKey: 'operation', traceId: 'trace', requiredCapabilities: ['invoke:tool'], runContext: { runId: 'run', sessionId: 'session', writerEpoch: 1, mode: 'execute', deadlineAt: deadline, budgetRef: { tenantId: 'tenant', accountId: 'account', rootRunId: 'run' } } };
  record = { approvalId: 'approval', requester: { grantId: 'user-grant', principal }, approver: { grantId: 'human-grant', principal: { ...principal, subjectId: 'human' } }, request, policyVersion: '1', nonce: 'nonce', expiresAt: new Date(Date.now() + 60000).toISOString() };
  await admin.query("INSERT INTO tenants(tenant_id,display_name) VALUES('tenant','Policy fixture'),('other','Other fixture')");
  await admin.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd,token_limit) VALUES('account','tenant','main',1000,1000)");
  await admin.query("INSERT INTO sessions(session_id,tenant_id,principal_id,mode,writer_epoch) VALUES('session','tenant','user','execute',1)");
  await admin.query("INSERT INTO runs(run_id,session_id,tenant_id,writer_epoch,mode,status,deadline_at,budget_account_id) VALUES('run','session','tenant',1,'execute','running',$1,'account')", [deadline]);
  await admin.query("INSERT INTO writer_leases(session_id,run_id,tenant_id,writer_epoch,owner_id,expires_at) VALUES('session','run','tenant',1,'owner',$1)", [deadline]);
  await admin.query("SELECT set_config('asi.tenant_id','tenant',false),set_config('asi.owner_id','owner',false)");
  await admin.query("INSERT INTO effect_journal(effect_id,tenant_id,run_id,effect_type,action,resource,input_hash,artifact_hash,idempotency_key,writer_epoch,intent_json) VALUES('effect','tenant','run','tool',$1,$2,$3,$4,'operation',1,$5)", [request.action, request.resource, Buffer.from(request.inputHash,'hex'), Buffer.from(request.artifactHash!, 'hex'), request]);
  configureIdentity({ defaultKid: 'test', keys: [{ kid: 'test', alg: 'HS256', secret: 'identity-test-key-32-bytes-minimum-0123456789', createdAt: Date.now() - 1000 }] });
  setGrantStore(new PostgresGrantStore(admin));
  userToken = await createPrincipalToken(principal);
  user = await verifyPrincipal(userToken, 'policy-kernel');
  human = await verifyPrincipal(await createPrincipalToken({ ...principal, subjectId: 'human' }), 'policy-kernel');
  record['requester']={grantId:(await requireAuthenticatedPrincipal(user)).grantId,principal:user};
  record['approver']={grantId:(await requireAuthenticatedPrincipal(human)).grantId,principal:human};
}, 10000);

describe('canonical policy approval PostgreSQL owner', () => {
  it('persists separate immutable request and decision signatures', async () => {
    await create(); await approve();
    const r = (await admin.query('SELECT request_signature,decision_signature,request_json,decision_json FROM approvals')).rows[0];
    expect(r.request_signature).toBe(signature); expect(r.decision_signature).toBe(decisionSignature); expect(r.request_json).toEqual(record); expect(r.decision_json.actor.principal.subjectId).toBe('human');
  });
  it('atomically consumes once and authorizes the canonical effect', async () => {
    await create(); await approve(); const results = await Promise.allSettled(Array.from({length: 10}, () => consume()));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await admin.query("SELECT status FROM effect_journal WHERE effect_id='effect'")).rows[0].status).toBe('authorized');
    expect((await admin.query('SELECT consumed_at FROM approvals')).rows[0].consumed_at).not.toBeNull();
  });
  it('rejects an incorrect designated approver and nonce', async () => {
    await create(); await expect(approve('other')).rejects.toThrow(); await expect(approve('human', 'wrong')).rejects.toThrow(); await approve();
  });
  it('rejects request/artifact substitution and leaves the nonce unused', async () => {
    await create(); await approve(); await expect(consume({...request, artifactHash: '03'.repeat(32)})).rejects.toThrow();
    expect((await admin.query('SELECT consumed_at FROM approvals')).rows[0].consumed_at).toBeNull();
  });
  it('rejects cancellation and stale epochs before consuming', async () => {
    await create(); await approve(); await expect(consume({...request, runContext: {...request.runContext, writerEpoch: 2}})).rejects.toThrow();
    await admin.query("UPDATE runs SET status='cancelled' WHERE run_id='run'"); await expect(consume()).rejects.toThrow();
  });
  it('denies direct DML and hides foreign tenant rows under FORCE RLS', async () => {
    await create(); await expect(tx(c => c.query("UPDATE approvals SET nonce='changed'"))).rejects.toThrow();
    expect((await tx(c => c.query('SELECT * FROM approvals'), 'other')).rows).toHaveLength(0);
    await expect(tx(c => c.query('SELECT p07_get($1,$2)', [request.runContext,'approval']), 'other')).rejects.toThrow();
  });
  it('immutable guards reject owner tampering after approval', async () => {
    await create(); await approve(); await expect(admin.query("UPDATE approvals SET input_hash=decode(repeat('ff',32),'hex')")).rejects.toThrow();
    await expect(admin.query("UPDATE approvals SET decision_signature=repeat('ff',32)")).rejects.toThrow();
  });
  it('never authorizes a pending request signature', async () => {
    await create(); await expect(consume()).rejects.toThrow(); expect((await admin.query('SELECT consumed_at FROM approvals')).rows[0].consumed_at).toBeNull();
  });
  it('rejects a decision without a persisted signature',async()=>{
    await create();await expect(tx(c=>c.query('SELECT p07_decide($1,$2,$3,$4,$5)',[request.runContext,'approval','nonce',decision(),null]))).rejects.toThrow();
  });
  it('halts populated legacy approval conversion without changing legacy data',async()=>{
    const legacy=schema+'_legacy',c=await admin.connect();
    try{
      await c.query('CREATE SCHEMA '+legacy);await c.query('CREATE TABLE '+legacy+'.approvals(marker text)');await c.query('INSERT INTO '+legacy+".approvals VALUES('preserved')");
      await c.query('BEGIN');await c.query('SET LOCAL search_path TO '+legacy+',public');
      await expect(c.query(readFileSync('backend/database/migrations/postgres/016-policy-qualification.sql','utf8'))).rejects.toThrow('Populated legacy approvals');await c.query('ROLLBACK');
      expect((await c.query('SELECT * FROM '+legacy+'.approvals')).rows).toEqual([{marker:'preserved'}]);
    }finally{await c.query('ROLLBACK');await c.query('DROP SCHEMA IF EXISTS '+legacy+' CASCADE');c.release();}
  });
});

describe('authenticated policy service composition', () => {
  let activeVersion='1';
  beforeEach(()=>{activeVersion='1';});
  async function service(requireApproval = true) {
    const { createPolicyService } = await import('../../backend/modules/policy/src/runtime.js');
    return createPolicyService({ pool, tenantId: 'tenant', ownerId: 'owner', context: request.runContext, principal: user, signingKey: 'policy-test-key-32-bytes-minimum-0123456789', transportKey: 'transport-test-key-32-bytes-minimum-0123456789', tokenTtlMs: 30000, loadPolicy: async () => ({ version: activeVersion, defaultEffect: 'deny', rules: [{ capability: 'invoke:tool', effect: 'allow', conditions: [] }], modeCapabilities: { observe: [], assist: [], execute: ['invoke:tool'] }, approvalRequired: requireApproval ? ['tool:*'] : [], protectedPaths: ['policy:'], maxEffectCostMicroUsd: 1000, approvalExpirySeconds: 60 }) });
  }
  it('rejects JSON principals and accepts only authenticated bound grants', async () => {
    const s = await service();
    await expect(s.authorizeEffect(request, { ...user })).rejects.toThrow(/authenticated/i);
    expect((await s.authorizeEffect(request, user)).decision).toBe('approval_required');
  });
  it('denies a same-tenant principal from authorizing another conversation',async()=>{
    const original=user;user=human;let s;try{s=await service(false);}finally{user=original;}
    await expect(s.authorizeEffect(request,human)).rejects.toThrow();
  });
  it('accepts an authenticated owner delegation and rejects its revoked parent',async()=>{
    const original=user;user=await verifyPrincipal(await delegatePrincipal(user,['invoke:tool'],'policy-kernel',user.expiresAt),'policy-kernel');
    const s=await service();expect((await s.authorizeEffect(request,user)).decision).toBe('approval_required');
    await revokeGrant((await requireAuthenticatedPrincipal(original)).grantId,'parent revoked');
    await expect(s.authorizeEffect(request,user)).rejects.toThrow(/revoked/i);
  });
  it('does not accept a delegated agent grant as a human approval identity',async()=>{
    const s=await service(),delegated=await verifyPrincipal(await delegatePrincipal(human,['invoke:tool'],'policy-kernel',human.expiresAt),'policy-kernel');
    await expect(s.createApproval(request,delegated)).rejects.toThrow(/human/i);
  });
  it('persists a signed approval, consumes it once and validates the exact execution token', async () => {
    const s = await service(), approval = await s.createApproval(request, human);
    await s.approveEffect({ schemaVersion: 1, approvalId: approval.approvalId, approver: human, effectId: request.effectId, inputHash: request.inputHash, policyVersion: '1', expiresAt: approval.expiresAt, nonce: approval.nonce });
    const token = await s.consumeApproval(approval.approvalId, approval.nonce, request);
    expect(Date.parse((JSON.parse(token) as {expiresAt:string}).expiresAt)).toBeLessThanOrEqual(Date.parse(approval.expiresAt));
    await expect(s.validateExecutionCapability(token, request)).resolves.toBeUndefined();
    await expect(s.consumeApproval(approval.approvalId, approval.nonce, request)).rejects.toThrow();
    await expect(s.validateExecutionCapability(token, { ...request, resource: 'tool:other' })).rejects.toThrow();
  });
  it('authorizes a policy-allowed effect before issuing its execution capability', async () => {
    const s = await service(false); const token = await s.issueExecutionCapability(request);
    await expect(s.validateExecutionCapability(token, request)).resolves.toBeUndefined();
    expect((await admin.query("SELECT status FROM effect_journal WHERE effect_id='effect'")).rows[0].status).toBe('authorized');
    await expect(s.issueExecutionCapability(request)).rejects.toThrow();
  });
  it('rejects revocation after construction', async () => {
    const s = await service(); await revokeGrant(parseGrantId(userToken), 'qualification revocation');
    await expect(s.authorizeEffect(request, user)).rejects.toThrow(/revoked/i);
  });
  async function approved(){const s=await service(),a=await s.createApproval(request,human);await s.approveEffect({schemaVersion:1,approvalId:a.approvalId,approver:human,effectId:request.effectId,inputHash:request.inputHash,policyVersion:'1',expiresAt:a.expiresAt,nonce:a.nonce});return {s,a};}
  async function waitForLock(){for(let i=0;i<100;i++){if((await admin.query("SELECT 1 FROM pg_stat_activity WHERE usename=current_user AND state='active' AND wait_event_type='Lock' AND query LIKE '%p07_%' LIMIT 1")).rows.length)return;await new Promise(done=>setTimeout(done,10));}throw new Error('Expected policy lock wait was not observed');}
  it('rejects policy rotation after a database lock wait and rolls back consumption',async()=>{
    const {s,a}=await approved(),lock=await admin.connect();await lock.query('BEGIN');await lock.query('SELECT 1 FROM approvals FOR UPDATE');
    const attempt=s.consumeApproval(a.approvalId,a.nonce,request);const outcome=expect(attempt).rejects.toThrow();
    try{await waitForLock();activeVersion='2';}finally{await lock.query('ROLLBACK');lock.release();}
    await outcome;expect((await admin.query('SELECT consumed_at FROM approvals')).rows[0].consumed_at).toBeNull();
  });
  it('rejects a revoked designated approver at consumption',async()=>{
    const {s,a}=await approved();const {requireAuthenticatedPrincipal}=await import('@asi/identity');await revokeGrant((await requireAuthenticatedPrincipal(human)).grantId,'approver revoked');
    await expect(s.consumeApproval(a.approvalId,a.nonce,request)).rejects.toThrow();
  });
  it('rejects execution validation after the designated approver is revoked',async()=>{
    const {s,a}=await approved(),token=await s.consumeApproval(a.approvalId,a.nonce,request);
    await revokeGrant((await requireAuthenticatedPrincipal(human)).grantId,'approver revoked after consumption');
    await expect(s.validateExecutionCapability(token,request)).rejects.toThrow();
  });
  it('rejects a lease that expires while waiting for the approval row',async()=>{
    const {s,a}=await approved(),lock=await admin.connect();
    await admin.query("UPDATE writer_leases SET expires_at=clock_timestamp()+interval '1 second'");
    await lock.query('BEGIN');await lock.query('SELECT 1 FROM approvals FOR UPDATE');
    const attempt=s.consumeApproval(a.approvalId,a.nonce,request),outcome=expect(attempt).rejects.toThrow();
    try{await waitForLock();await new Promise(done=>setTimeout(done,1100));}finally{await lock.query('ROLLBACK');lock.release();}
    await outcome;expect((await admin.query('SELECT consumed_at FROM approvals')).rows[0].consumed_at).toBeNull();
  });
  it('serves authenticated signed requests in a separate process and fails closed after termination', async () => {
    const transportKey='transport-test-key-32-bytes-minimum-0123456789';
    const {loadPolicyConfig}=await import('../../backend/modules/policy/src/evaluate.js');const processPolicy=resolve('build/task07-current-repair/process-policy-'+id+'.json'),policy=await loadPolicyConfig('infra/policies/default.yaml');writeFileSync(processPolicy,JSON.stringify(policy));
    const child=spawn(process.execPath,['backend/workers/policy-kernel/dist/main.js'],{env:{...process.env,POLICY_KERNEL_PORT:'0',POLICY_KERNEL_OWNER_ID:'owner',POLICY_CONFIG_PATH:processPolicy,POLICY_DATABASE_URL:url,IDENTITY_DATABASE_URL:url,PGOPTIONS:options+' -c role='+role,IDENTITY_PGOPTIONS:options,POLICY_SIGNING_KEY:Buffer.from('policy-test-key-32-bytes-minimum-0123456789').toString('base64'),POLICY_TRANSPORT_KEY:Buffer.from(transportKey).toString('base64'),IDENTITY_SIGNING_CONFIG:JSON.stringify({defaultKid:'test',keys:[{kid:'test',alg:'HS256',secret:'identity-test-key-32-bytes-minimum-0123456789',createdAt:Date.now()-1000}]})},stdio:['ignore','pipe','pipe']});
    try{
      const port=await new Promise<number>((resolvePort,reject)=>{const timer=setTimeout(()=>reject(new Error('Kernel readiness timeout')),5000);child.once('exit',()=>{clearTimeout(timer);reject(new Error('Kernel exited before readiness'));});child.stdout.on('data',chunk=>{const m=/POLICY_KERNEL_READY (\d+)/.exec(String(chunk));if(m){clearTimeout(timer);resolvePort(Number(m[1]));}});});
      const endpoint='http://127.0.0.1:'+port,body=JSON.stringify({operation:'authorize',timestamp:new Date().toISOString(),effectRequest:request});
      const {createHmac}=await import('node:crypto');const signature=createHmac('sha256',transportKey).update(body).digest('hex');
      const result=await fetch(endpoint,{method:'POST',body,headers:{authorization:'Bearer '+userToken,'x-signature':signature}});
      expect(result.status).toBe(200);const responseBody=await result.text();expect(result.headers.get('x-signature')).toBe(createHmac('sha256',transportKey).update(responseBody).digest('hex'));expect((JSON.parse(responseBody) as {decision:{decision:string}}).decision.decision).toBe('approval_required');
      writeFileSync(processPolicy,JSON.stringify({...policy,approvalRequired:[]}));
      const allowed=await fetch(endpoint,{method:'POST',body,headers:{authorization:'Bearer '+userToken,'x-signature':signature}});expect((await allowed.json() as {decision:{decision:string}}).decision.decision).toBe('allow');
      writeFileSync(processPolicy,JSON.stringify({...policy,protectedPaths:['tool:']}));
      const denied=await fetch(endpoint,{method:'POST',body,headers:{authorization:'Bearer '+userToken,'x-signature':signature}});expect((await denied.json() as {decision:{decision:string}}).decision.decision).toBe('deny');
      expect((await fetch(endpoint,{method:'POST',body,headers:{authorization:'Bearer '+userToken,'x-signature':'bad'}})).status).toBe(401);
      const stopped=once(child,'exit');child.kill();await stopped;
      await expect(fetch(endpoint,{method:'POST',body,headers:{authorization:'Bearer '+userToken,'x-signature':signature}})).rejects.toThrow();
    }finally{if(child.exitCode===null&&child.signalCode===null){const stopped=once(child,'exit');child.kill();await stopped;}unlinkSync(processPolicy);}
  });
});
