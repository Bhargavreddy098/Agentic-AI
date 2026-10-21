import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { evaluatePolicy } from '../../backend/modules/policy/src/evaluate.js';
import { createPostgresFixturePool } from '../../backend/modules/control/test/fixtures/postgres.js';
import { configureIdentity, createPrincipalToken, verifyPrincipal, setGrantStore, PostgresGrantStore } from '@asi/identity';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  authorizeEffect,
  loadPolicyConfig,
  requestApproval,
  approveEffect,
  verifyApproval,
  getCapabilitiesForMode,
  canModePerform,
  reduceCapabilitiesForMode,
  validateModeTransition,
  validateExecutionCapability,
  createExecutionToken,
  validateExecutionToken,
  checkCapabilitySubset,
  type PolicyConfig,
  type AuthorizationContext,
  type ApprovalConfig,
  type CapabilityValidationConfig,
  InMemoryCapabilityStore,
  createPolicyService,
  type PolicyService,
} from "../../backend/modules/policy/src/index.js";
import type { Principal, EffectRequest, PolicyVersion } from "../../packages/contracts/src/index.js";
import "fs";
import * as path from "path";

const TEST_POLICY_PATH = path.join(__dirname, "../../infra/policies/default.yaml");
const fixtureUrl = process.env['B07_TEST_DATABASE_URL'];
if (!fixtureUrl || !new URL(fixtureUrl).pathname.endsWith('_qualification') || !['localhost','127.0.0.1','[::1]'].includes(new URL(fixtureUrl).hostname)) throw new Error('Explicit local disposable B07_TEST_DATABASE_URL required');
const fixtureId=randomBytes(6).toString('hex'), fixtureSchema='s07_'+fixtureId, fixtureRole='s07_writer_'+fixtureId;
const fixtureOptions='-c search_path='+fixtureSchema+',public';
const fixtureAdmin=createPostgresFixturePool({connectionString:fixtureUrl,options:fixtureOptions,max:4,statement_timeout:5000});
type FixtureClient=NonNullable<Parameters<Parameters<typeof fixtureAdmin.connect>[0]>[1]>;
let fixturePool:ReturnType<typeof createPostgresFixturePool>, service:PolicyService, liveUser:Principal, liveHuman:Principal, liveRequest:EffectRequest;
let migrate:(client:FixtureClient,options:{schema:string;target:string})=>Promise<string[]>;
const fixtureKey=new Uint8Array(32).fill(17);
beforeAll(async()=>{
  await fixtureAdmin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  await fixtureAdmin.query('CREATE ROLE '+fixtureRole+' NOLOGIN NOSUPERUSER NOBYPASSRLS');
  const module=await import(pathToFileURL(path.resolve('scripts/apply-migrations.mjs')).href) as {applyReviewedMigrations:typeof migrate};migrate=module.applyReviewedMigrations;
  fixturePool=createPostgresFixturePool({connectionString:fixtureUrl,options:fixtureOptions+' -c role='+fixtureRole,max:4,statement_timeout:5000});
});
afterAll(async()=>{await fixturePool?.end();await fixtureAdmin.query('DROP SCHEMA IF EXISTS '+fixtureSchema+' CASCADE');await fixtureAdmin.query('DROP ROLE IF EXISTS '+fixtureRole);await fixtureAdmin.end();});
async function prepareLiveApprovalOwner():Promise<void>{
  await fixtureAdmin.query('DROP SCHEMA IF EXISTS '+fixtureSchema+' CASCADE');await fixtureAdmin.query('CREATE SCHEMA '+fixtureSchema);
  const c=await fixtureAdmin.connect();try{await migrate(c,{schema:fixtureSchema,target:'07'});}finally{c.release();}
  await fixtureAdmin.query('GRANT USAGE ON SCHEMA '+fixtureSchema+' TO '+fixtureRole);
  await fixtureAdmin.query('GRANT EXECUTE ON FUNCTION p07_requester(jsonb,jsonb),p07_bind(jsonb,jsonb),p07_create(jsonb,jsonb,jsonb,text),p07_decide(jsonb,text,text,jsonb,text),p07_consume(jsonb,jsonb,text,text,text),p07_get(jsonb,text),p07_list(jsonb),p07_expire(jsonb),p07_check(jsonb,jsonb),p07_authorize(jsonb,jsonb) TO '+fixtureRole);
  const deadline=new Date(Date.now()+120000).toISOString();
  liveRequest=createTestEffectRequest({effectId:'effect',action:'tool:invoke',resource:'tool:search',requiredCapabilities:['invoke:tool'],artifactHash:'02'.repeat(32)});
  liveRequest.runContext={runId:'run',sessionId:'session',writerEpoch:1,mode:'execute',deadlineAt:deadline,budgetRef:{tenantId:'tenant-1',accountId:'account',rootRunId:'run'}};
  await fixtureAdmin.query("INSERT INTO tenants(tenant_id,display_name) VALUES('tenant-1','Security fixture')");
  await fixtureAdmin.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd,token_limit) VALUES('account','tenant-1','main',1000,1000)");
  await fixtureAdmin.query("INSERT INTO sessions(session_id,tenant_id,principal_id,mode,writer_epoch) VALUES('session','tenant-1','subject-1','execute',1)");
  await fixtureAdmin.query("INSERT INTO runs(run_id,session_id,tenant_id,writer_epoch,mode,status,deadline_at,budget_account_id) VALUES('run','session','tenant-1',1,'execute','running',$1,'account')",[deadline]);
  await fixtureAdmin.query("INSERT INTO writer_leases(session_id,run_id,tenant_id,writer_epoch,owner_id,expires_at) VALUES('session','run','tenant-1',1,'owner',$1)",[deadline]);
  await fixtureAdmin.query("SELECT set_config('asi.tenant_id','tenant-1',false),set_config('asi.owner_id','owner',false)");
  await fixtureAdmin.query("INSERT INTO effect_journal(effect_id,tenant_id,run_id,effect_type,action,resource,input_hash,artifact_hash,idempotency_key,writer_epoch,intent_json) VALUES('effect','tenant-1','run','tool',$1,$2,$3,$4,$5,1,$6)",[liveRequest.action,liveRequest.resource,Buffer.from(liveRequest.inputHash,'hex'),Buffer.from(liveRequest.artifactHash!,'hex'),liveRequest.idempotencyKey,liveRequest]);
  configureIdentity({defaultKid:'security',keys:[{kid:'security',alg:'HS256',secret:'identity-test-key-32-bytes-minimum-0123456789',createdAt:Date.now()-1000}]});setGrantStore(new PostgresGrantStore(fixtureAdmin));
  liveUser=await verifyPrincipal(await createPrincipalToken(createTestPrincipal({expiresAt:deadline})),'policy-kernel');
  liveHuman=await verifyPrincipal(await createPrincipalToken(createTestPrincipal({subjectId:'human',expiresAt:deadline})),'policy-kernel');
  service=await createPolicyService({pool:fixturePool,tenantId:'tenant-1',ownerId:'owner',context:liveRequest.runContext,principal:liveUser,signingKey:fixtureKey,transportKey:new Uint8Array(32).fill(18),tokenTtlMs:30000,loadPolicy:async()=>({version:'1',defaultEffect:'deny',rules:[{capability:'invoke:tool',effect:'allow',conditions:[]}],modeCapabilities:{execute:['invoke:tool']},approvalRequired:['tool:*'],protectedPaths:[],maxEffectCostMicroUsd:1000,approvalExpirySeconds:60})});
}

function createTestPrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    tenantId: "tenant-1",
    subjectId: "subject-1",
    roles: ["user"],
    capabilities: ["invoke:model", "invoke:tool", "publish:effect", "request:approval", "manage:budget", "read:session", "read:memory", "read:tools", "read:models", "read:policy", "write:session", "write:memory"],
    audience: "policy-kernel",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    authenticatedSource: "platform-adapter",
    ...overrides,
  };
}

function createTestEffectRequest(overrides: Partial<EffectRequest> = {}): EffectRequest {
  return {
    schemaVersion: 1,
    effectId: "effect-1",
    action: "model:invoke",
    resource: "model:gpt-4",
    inputHash: "01".repeat(32),
    runContext: {
      runId: "run-1",
      sessionId: "session-1",
      writerEpoch: 1,
      mode: "execute",
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: "tenant-1",
        accountId: "account-1",
        rootRunId: "root-run-1",
      },
    },
    idempotencyKey: "idem-1",
    traceId: "trace-1",
    requiredCapabilities: ["invoke:model"],
    ...overrides,
  };
}

function createAuthContext(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  const principal = createTestPrincipal();
  const effectRequest = createTestEffectRequest();
  const policyVersion = "1" as PolicyVersion;

  return {
    principal,
    effectRequest,
    policyVersion,
    runMode: "execute",
    config: { version: "1", defaultEffect: "deny", rules: [], modeCapabilities: {}, approvalRequired: [], protectedPaths: [], maxEffectCostMicroUsd: 1000000, approvalExpirySeconds: 300 },
    ...overrides,
  };
}

describe("Policy Evaluation", () => {
  let config: PolicyConfig;

  beforeEach(async () => {
    config = await loadPolicyConfig(TEST_POLICY_PATH);
  });

  it("loads policy config from YAML", () => {
    expect(config.version).toBe("1");
    expect(config.defaultEffect).toBe("deny");
    expect(config.rules.length).toBeGreaterThan(0);
    expect(config.modeCapabilities).toBeDefined();
    expect(config.approvalRequired).toBeDefined();
    expect(config.protectedPaths).toBeDefined();
  });

  it("allows authorized effect request in execute mode", async () => {
    const context = createAuthContext({ effectRequest: createTestEffectRequest({ action: "tool:invoke", resource: "tool:search" }) });
    const result = evaluatePolicy({ ...config, approvalRequired: [] }, context.effectRequest, context.principal);
    expect(result.decision).toBe("allow");
    expect(result.boundCapability).toBeDefined();
  });

  it("denies effect request with missing capability", async () => {
    const principal = createTestPrincipal({ capabilities: ["read:session"] });
    const effectRequest = createTestEffectRequest({ action: "model:invoke" });
    const context = createAuthContext({ principal, effectRequest });

    const result = evaluatePolicy(config, context.effectRequest, context.principal);
    expect(result.decision).toBe("deny");
  });

  it("denies write action in observe mode", async () => {
    const principal = createTestPrincipal();
    const effectRequest = createTestEffectRequest({ action: "write:memory", requiredCapabilities: ['read:memory'] });
    effectRequest.runContext.mode = 'observe';
    const context = createAuthContext({ principal, effectRequest, runMode: "observe" });

    const result = evaluatePolicy(config, context.effectRequest, context.principal);
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("observe");
  });

  it("denies access to protected paths", async () => {
    const principal = createTestPrincipal({ capabilities: ["admin:*"] });
    const effectRequest = createTestEffectRequest({ resource: "tenant:admin" });
    const context = createAuthContext({ principal, effectRequest });

    const result = evaluatePolicy({ ...config, protectedPaths: ['tenant:admin'] }, context.effectRequest, context.principal);
    expect(result.decision).toBe("deny");
  });

  it("denies stale epoch", async () => {
    await prepareLiveApprovalOwner();
    await fixtureAdmin.query("UPDATE sessions SET writer_epoch=2 WHERE session_id='session'");
    await expect(authorizeEffect({config,service},createAuthContext({principal:liveUser,effectRequest:liveRequest}))).rejects.toThrow();
  });});

describe("Mode Capabilities", () => {
  let config: PolicyConfig;

  beforeEach(async () => {
    config = await loadPolicyConfig(TEST_POLICY_PATH);
  });

  it("returns correct capabilities for observe mode", () => {
    const caps = getCapabilitiesForMode("observe", config);
    expect(caps).toContain("read:session");
    expect(caps).toContain("read:memory");
    expect(caps).not.toContain("write:session");
  });

  it("returns correct capabilities for assist mode", () => {
    const caps = getCapabilitiesForMode("assist", config);
    expect(caps).toContain("read:session");
    expect(caps).toContain("write:session");
    expect(caps).not.toContain("publish:effect");
  });

  it("returns correct capabilities for execute mode", () => {
    const caps = getCapabilitiesForMode("execute", config);
    expect(caps).toContain("publish:effect");
    expect(caps).toContain("request:approval");
    expect(caps).toContain("manage:budget");
  });

  it("checks mode capability correctly", () => {
    expect(canModePerform("execute", "publish:effect", config)).toBe(true);
    expect(canModePerform("assist", "publish:effect", config)).toBe(false);
    expect(canModePerform("observe", "write:session", config)).toBe(false);
  });

  it("reduces capabilities for mode", () => {
    const requested = ["read:session", "write:session", "publish:effect", "admin:delete"];
    const reduced = reduceCapabilitiesForMode(requested, "assist", config);
    expect(reduced).toContain("read:session");
    expect(reduced).toContain("write:session");
    expect(reduced).not.toContain("publish:effect");
    expect(reduced).not.toContain("admin:delete");
  });

  it("validates mode transition", () => {
    const principal = createTestPrincipal();
    const result = validateModeTransition({
      fromMode: "observe",
      toMode: "execute",
      principal,
      policyVersion: "1",
    }, config);
    expect(result.valid).toBe(true);
  });

  it("denies mode transition with missing capabilities", () => {
    const principal = createTestPrincipal({ capabilities: ["read:session"] });
    const result = validateModeTransition({
      fromMode: "observe",
      toMode: "execute",
      principal,
      policyVersion: "1",
    }, config);
    expect(result.valid).toBe(false);
  });
});

describe("Approvals", () => {
  beforeEach(prepareLiveApprovalOwner,10000);
  function config():ApprovalConfig {return {signingKey:fixtureKey,approvalExpirySeconds:60,service,approver:liveHuman};}
  async function requested() {return requestApproval(config(),service,{effectRequest:liveRequest,effectId:liveRequest.effectId,runId:liveRequest.runContext.runId,tenantId:'tenant-1',inputHash:Buffer.from(liveRequest.inputHash,'hex'),artifactHash:Buffer.from(liveRequest.artifactHash!,'hex'),policyVersion:'1',approver:liveHuman});}
  it("requests approval and stores with nonce", async () => {
    const a=await requested();expect(a.approvalId).toBeDefined();expect(a.nonce).toBeDefined();expect(a.expiresAt).toBeDefined();
    const row=(await fixtureAdmin.query('SELECT nonce,request_signature FROM approvals')).rows[0];expect(row.nonce).toBe(a.nonce);expect(row.request_signature).toMatch(/^[a-f0-9]{64}$/);
  });
  it("approves effect with correct nonce", async () => {
    const a=await requested();await approveEffect(config(),service,a.approvalId,a.nonce,'tenant-1','approve','human');
    const row=(await fixtureAdmin.query('SELECT decision,decision_signature FROM approvals')).rows[0];expect(row.decision).toBe('approve');expect(row.decision_signature).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects approval with wrong nonce", async () => {
    const a=await requested();await expect(approveEffect(config(),service,a.approvalId,'wrong','tenant-1','approve','human')).rejects.toThrow('Invalid nonce');
    expect((await fixtureAdmin.query('SELECT decision FROM approvals')).rows[0].decision).toBeNull();
  });
  it("verifies valid approval", async () => {
    const a=await requested();await approveEffect(config(),service,a.approvalId,a.nonce,'tenant-1','approve','human');
    expect((await verifyApproval(config(),service,{approvalId:a.approvalId,nonce:a.nonce,tenantId:'tenant-1'})).valid).toBe(true);
  });
});

describe("Capabilities", () => {
  let store: InMemoryCapabilityStore;
  let validationConfig: CapabilityValidationConfig;

  beforeEach(() => {
    store = new InMemoryCapabilityStore();
    validationConfig = {
      tenantId: "tenant-1",
      principal: createTestPrincipal(),
      runMode: "execute",
      policyVersion: "1" as PolicyVersion,
      currentTime: new Date(),
      signingKey: new Uint8Array(32).fill(17),
    };
  });

  it("validates execution capability successfully", async () => {
    const effectRequest = createTestEffectRequest({
      requiredCapabilities: ["invoke:model", "invoke:tool"],
    });

    await store.setGrant({
      capability: "invoke:model",
      tenantId: "tenant-1",
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      grantedBy: "admin",
    });
    await store.setGrant({
      capability: "invoke:tool",
      tenantId: "tenant-1",
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      grantedBy: "admin",
    });

    const result = await validateExecutionCapability(validationConfig, effectRequest, store);
    expect(result.valid).toBe(true);
  });

  it("rejects missing capability", async () => {
    const effectRequest = createTestEffectRequest({
      requiredCapabilities: ["invoke:model", "admin:delete"],
    });

    await store.setGrant({
      capability: "invoke:model",
      tenantId: "tenant-1",
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      grantedBy: "admin",
    });

    const result = await validateExecutionCapability(validationConfig, effectRequest, store);
    expect(result.valid).toBe(false);
    expect(result.missingCapabilities).toContain("admin:delete");
  });

  it("rejects expired capability", async () => {
    const effectRequest = createTestEffectRequest({
      requiredCapabilities: ["invoke:model"],
    });

    await store.setGrant({
      capability: "invoke:model",
      tenantId: "tenant-1",
      grantedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
      grantedBy: "admin",
    });

    const result = await validateExecutionCapability(validationConfig, effectRequest, store);
    expect(result.valid).toBe(false);
    expect(result.missingCapabilities).toContain("invoke:model");
  });

  it("creates and validates execution token", async () => {
    const effectRequest = createTestEffectRequest({ requiredCapabilities: ["invoke:model"] });
    const token = createExecutionToken("invoke:model", validationConfig, effectRequest, 30000);

    expect(token.tokenId).toBeDefined();
    expect(token.capability).toBe("invoke:model");
    expect(token.tenantId).toBe("tenant-1");

    const validation = validateExecutionToken(token, effectRequest, new Date(), 'tenant-1', validationConfig.signingKey);
    expect(validation.valid).toBe(true);
  });

  it("rejects token with wrong input hash", async () => {
    const effectRequest = createTestEffectRequest({ requiredCapabilities: ["invoke:model"] });
    const token = createExecutionToken("invoke:model", validationConfig, effectRequest, 30000);

    const wrongRequest = createTestEffectRequest({ inputHash: "0".repeat(64) });
    const validation = validateExecutionToken(token, wrongRequest, new Date(), 'tenant-1', validationConfig.signingKey);
    expect(validation.valid).toBe(false);
  });

  it("checks capability subset correctly", () => {
    const parent = ["invoke:model", "invoke:tool", "publish:effect"];
    const child = ["invoke:model", "invoke:tool"];

    const result = checkCapabilitySubset(parent, child);
    expect(result.valid).toBe(true);
    expect(result.exceedingCapabilities).toHaveLength(0);
  });

  it("detects exceeding capabilities in subset check", () => {
    const parent = ["invoke:model", "invoke:tool"];
    const child = ["invoke:model", "invoke:tool", "admin:delete"];

    const result = checkCapabilitySubset(parent, child);
    expect(result.valid).toBe(false);
    expect(result.exceedingCapabilities).toContain("admin:delete");
  });
});
