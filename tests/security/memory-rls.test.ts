import { createPostgresFixturePool, type PostgresFixturePool as Pool } from "../../packages/control/test/fixtures/postgres.js";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  queryMemory,
  publishMemory,
  revertMemoryRevision,
  type QueryMemoryConfig,
  type PublishMemoryConfig,
} from "../../packages/memory/src/index.js";
import type { Principal, MemoryWrite, MemoryQuery, RunContext } from "@asi/contracts";

const TEST_TENANT_A = "tenant-a";
const TEST_TENANT_B = "tenant-b";

let pool: Pool;

function createQueryConfig(): QueryMemoryConfig {
  return { pool };
}

function createPublishConfig(): PublishMemoryConfig {
  return { pool };
}

function createPrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    tenantId: TEST_TENANT_A,
    subjectId: "subject-1",
    roles: ["user", "role-a"],
    capabilities: ["memory:read", "memory:write"],
    audience: "memory-broker",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    authenticatedSource: "platform-adapter",
    ...overrides,
  };
}

function createQueryContext(tenantId: string): RunContext {
  return {runId:'run-1',sessionId:'session-1',writerEpoch:1,mode:'execute',deadlineAt:new Date(Date.now()+3600000).toISOString(),budgetRef:{tenantId,accountId:'account-1',rootRunId:'run-1'}};
}
function createMemoryQuery(tenantId: string, text: string, scope: MemoryQuery['requestedScopes'][number]): MemoryQuery {
 return {schemaVersion:1,query:{type:'text',text},requestedScopes:[scope],limit:10,runContext:createQueryContext(tenantId)};
}

function createMemoryWrite(overrides: Record<string, unknown> = {}): MemoryWrite {
  return {
    schemaVersion: 1,
    record: {
      schemaVersion: 1,
      memoryId: undefined,
      tenantId: TEST_TENANT_A,
      scope: "Global",
      roleId: undefined,
      agentId: undefined,
      version: 1,
      value: "test memory",
      confidence: 0.9,
      sourceEpisodeIds: [],
      authority: "consolidation",
      sensitivity: "internal",
    },
    runContext: {
      runId: "run-1",
      sessionId: "session-1",
      writerEpoch: 1,
      mode: "execute",
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: TEST_TENANT_A,
        accountId: "account-1",
        rootRunId: "root-1",
      },
    },
    effectRequest: undefined,
    sourceEpisodeIds: [],
    ...overrides,
  } as unknown as MemoryWrite;
}

beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/asi_test";
  pool = createPostgresFixturePool({ connectionString, max: 10 });
  await pool.query("SELECT 1");
}, 30000);

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await pool.query("DELETE FROM memory_records WHERE tenant_id IN ($1, $2)", [TEST_TENANT_A, TEST_TENANT_B]);
  await pool.query("DELETE FROM memory_revisions WHERE tenant_id IN ($1, $2)", [TEST_TENANT_A, TEST_TENANT_B]);
  await pool.query("DELETE FROM memory_embeddings WHERE tenant_id IN ($1, $2)", [TEST_TENANT_A, TEST_TENANT_B]);
});

describe("Memory RLS", () => {
  it("inserts and queries Global scope memory", async () => {
    const principal = createPrincipal({ tenantId: TEST_TENANT_A, roles: ["user"] });
    const write = createMemoryWrite({ record: { scope: "Global", value: "global memory" } });

    const publishConfig = createPublishConfig();
    const result = await publishMemory(publishConfig, { principal, write, expectedVersion: null });

    expect(result.record).toBeDefined();
    expect(result.record.scope).toBe("Global");
    expect(result.record.value).toBe("global memory");
    expect(result.record.tenantId).toBe(TEST_TENANT_A);

    const queryConfig = createQueryConfig();
    const queryResult = await queryMemory(queryConfig, {
      principal,
      query: createMemoryQuery(principal.tenantId, 'global', 'Global'),
    });

    expect(queryResult.records.length).toBeGreaterThanOrEqual(1);
    expect(queryResult.records[0]?.value).toBe("global memory");
  });

  it("inserts and queries Role scope memory", async () => {
    const principal = createPrincipal({ tenantId: TEST_TENANT_A, roles: ["user", "role-a"] });
    const write = createMemoryWrite({ record: { scope: "Role", roleId: "role-a", value: "role memory" } });

    const publishConfig = createPublishConfig();
    const result = await publishMemory(publishConfig, { principal, write, expectedVersion: null });

    expect(result.record).toBeDefined();
    expect(result.record.scope).toBe("Role");
    expect(result.record.roleId).toBe("role-a");

    // Same tenant, same role can query
    const queryConfig = createQueryConfig();
    const queryResult = await queryMemory(queryConfig, {
      principal,
      query: createMemoryQuery(principal.tenantId, 'role', 'Role'),
    });

    expect(queryResult.records.length).toBeGreaterThanOrEqual(1);
  });

  it("denies Role scope access to principals without the role", async () => {
    const principalA = createPrincipal({ tenantId: TEST_TENANT_A, roles: ["user", "role-a"] });
    const write = createMemoryWrite({ record: { scope: "Role", roleId: "role-a", value: "role-a secret" } });

    await publishMemory(createPublishConfig(), { principal: principalA, write, expectedVersion: null });

    // Principal B with different role cannot see it
    const principalB = createPrincipal({ tenantId: TEST_TENANT_A, roles: ["user", "role-b"] });
    const queryConfig = createQueryConfig();
    const queryResult = await queryMemory(queryConfig, {
      principal: principalB,
      query: createMemoryQuery(principalB.tenantId, 'role-a', 'Role'),
    });

    expect(queryResult.records.length).toBe(0);
  });

  it("inserts and queries Private scope memory", async () => {
    const principal = createPrincipal({ tenantId: TEST_TENANT_A, subjectId: "subject-1" });
    const write = createMemoryWrite({
      record: { scope: "Private", agentId: "agent-1", value: "private memory" },
    });

    const publishConfig = createPublishConfig();
    const result = await publishMemory(publishConfig, { principal: { ...principal, agentId: "agent-1" }, write, expectedVersion: null });

    expect(result.record).toBeDefined();
    expect(result.record.scope).toBe("Private");
    expect(result.record.ownerAgentId).toBe("agent-1");

    const queryConfig = createQueryConfig();
    const queryResult = await queryMemory(queryConfig, {
      principal: { ...principal, agentId: "agent-1" },
      query: createMemoryQuery(principal.tenantId, 'private', 'Private'),
    });

    expect(queryResult.records.length).toBeGreaterThanOrEqual(1);
  });

  it("denies Private scope access to other agents", async () => {
    const principalA = createPrincipal({ tenantId: TEST_TENANT_A, subjectId: "subject-1", agentId: "agent-1" });
    const write = createMemoryWrite({ record: { scope: "Private", agentId: "agent-1", value: "agent-1 private" } });

    await publishMemory(createPublishConfig(), { principal: principalA, write, expectedVersion: null });

    const principalB = createPrincipal({ tenantId: TEST_TENANT_A, subjectId: "subject-2", agentId: "agent-2" });
    const queryConfig = createQueryConfig();
    const queryResult = await queryMemory(queryConfig, {
      principal: principalB,
      query: createMemoryQuery(principalB.tenantId, 'private', 'Private'),
    });

    expect(queryResult.records.length).toBe(0);
  });

  it("tenant A cannot see tenant B memory (any scope)", async () => {
    const principalA = createPrincipal({ tenantId: TEST_TENANT_A });
    const principalB = createPrincipal({ tenantId: TEST_TENANT_B });

    const writeA = createMemoryWrite({ record: { scope: "Global", value: "tenant A global" } });
    const writeB = createMemoryWrite({ record: { scope: "Global", value: "tenant B global" } });

    await publishMemory(createPublishConfig(), { principal: principalA, write: writeA, expectedVersion: null });
    await publishMemory(createPublishConfig(), { principal: principalB, write: writeB, expectedVersion: null });

    const queryConfig = createQueryConfig();
    const resultA = await queryMemory(queryConfig, {
      principal: principalA,
      query: createMemoryQuery(principalA.tenantId, 'global', 'Global'),
    });

    const resultB = await queryMemory(queryConfig, {
      principal: principalB,
      query: createMemoryQuery(principalB.tenantId, 'global', 'Global'),
    });

    expect(resultA.records.every(r => r.tenantId === TEST_TENANT_A)).toBe(true);
    expect(resultB.records.every(r => r.tenantId === TEST_TENANT_B)).toBe(true);
  });

  it("CAS on publish prevents lost updates", async () => {
    const principal = createPrincipal();
    const write = createMemoryWrite({ record: { scope: "Global", value: "original" } });

    const publishConfig = createPublishConfig();
    const result1 = await publishMemory(publishConfig, { principal, write, expectedVersion: null });
    const memoryId = result1.record.memoryId;

    // Update with correct version
    const write2 = createMemoryWrite({
      record: { ...write.record, memoryId, version: 1, value: "updated" },
    });
    await publishMemory(publishConfig, { principal, write: write2, expectedVersion: 1 });

    // Attempt to update with stale version should fail
    const write3 = createMemoryWrite({
      record: { ...write.record, memoryId, version: 1, value: "stale update" },
    });

    await expect(
      publishMemory(publishConfig, { principal, write: write3, expectedVersion: 1 }),
    ).rejects.toThrow("CAS failed");
  });

  it("reverts memory to previous revision", async () => {
    const principal = createPrincipal();

    // Create initial record
    const write1 = createMemoryWrite({ record: { scope: "Global", value: "v1" } });
    const result1 = await publishMemory(createPublishConfig(), { principal, write: write1, expectedVersion: null });
    const memoryId = result1.record.memoryId;

    // Update to v2
    const write2 = createMemoryWrite({ record: { ...write1.record, memoryId, version: 1, value: "v2" } });
    await publishMemory(createPublishConfig(), { principal, write: write2, expectedVersion: 1 });

    // Get revisions
    const revisions = await pool.query(
      `SELECT revision_id, value FROM memory_revisions WHERE memory_id = $1 ORDER BY version`,
      [memoryId],
    );

    expect(revisions.rows.length).toBe(2);
    expect(revisions.rows[0].value).toBe("v1");
    expect(revisions.rows[1].value).toBe("v2");

    // Revert to v1
    const revertConfig = { pool };
    const reverted = await revertMemoryRevision(revertConfig, {
      principal,
      memoryId,
      revisionId: revisions.rows[0].revision_id,
      tenantId: TEST_TENANT_A,
    });

    expect(reverted.record.value).toBe("v1");
    expect(reverted.record.version).toBeGreaterThan(1);
  });

  it("scope escalation rejects (Private -> Global)", async () => {
    const principal = createPrincipal({ tenantId: TEST_TENANT_A, agentId: "agent-1" });
    const write = createMemoryWrite({
      record: { scope: "Private", agentId: "agent-1", value: "private" },
    });

    await publishMemory(createPublishConfig(), { principal, write, expectedVersion: null });

    // Try to update to Global scope - should fail due to scope constraint
    const write2 = createMemoryWrite({
      record: { scope: "Global", value: "escalated" },
    });

    await expect(
      publishMemory(createPublishConfig(), { principal, write: write2, expectedVersion: null }),
    ).rejects.toThrow();
  });

  it("two writers with same expectedVersion cannot both succeed", async () => {
    const principal = createPrincipal();
    const write = createMemoryWrite({ record: { scope: "Global", value: "concurrent" } });

    const publishConfig = createPublishConfig();
    const result1 = await publishMemory(publishConfig, { principal, write, expectedVersion: null });
    const memoryId = result1.record.memoryId;

    // Two concurrent updates with same expected version
    const write2 = createMemoryWrite({ record: { ...write.record, memoryId, version: 1, value: "update-1" } });
    const write3 = createMemoryWrite({ record: { ...write.record, memoryId, version: 1, value: "update-2" } });

    const [result2, result3] = await Promise.allSettled([
      publishMemory(publishConfig, { principal, write: write2, expectedVersion: 1 }),
      publishMemory(publishConfig, { principal, write: write3, expectedVersion: 1 }),
    ]);

    // One should succeed, one should fail
    const succeeded = [result2, result3].filter(r => r.status === "fulfilled").length;
    const failed = [result2, result3].filter(r => r.status === "rejected").length;
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);
  });
});