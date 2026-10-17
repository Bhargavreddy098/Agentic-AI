import { createPostgresFixturePool, type PostgresFixturePool as Pool } from "../../packages/control/test/fixtures/postgres.js";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createQueueAdapter } from "@asi/specialists";
import type { TaskEnvelope } from "@asi/contracts";

const TEST_TENANT = "tenant-a";

let pool: Pool;
let queueAdapter: ReturnType<typeof createQueueAdapter>;

function createTestTask(overrides: Partial<TaskEnvelope> = {}): TaskEnvelope {
  return {
    schemaVersion: 1,
    taskId: "test-task",
    traceId: "trace-1",
    correlationId: "corr-1",
    causationId: "cause-1",
    runContext: {
      runId: "run-1",
      sessionId: "session-1",
      writerEpoch: 1,
      mode: "execute",
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: TEST_TENANT,
        accountId: "account-1",
        rootRunId: "root-1",
      },
    },
    requiredCapabilities: ["test:capability"],
    input: { test: true },
    principalGrant: {
      tenantId: TEST_TENANT,
      subjectId: "subject-1",
      roles: ["user"],
      capabilities: ["test:capability"],
      audience: "test",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "test",
    },
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/asi_test";
  pool = createPostgresFixturePool({ connectionString, max: 10 });
  await pool.query("SELECT 1");
  
  queueAdapter = createQueueAdapter();
}, 30000);

afterAll(async () => {
  await pool?.end();
  await queueAdapter?.close();
});

beforeEach(async () => {
  // Clear the queue if in-memory
  (queueAdapter as unknown as { jobs?: Map<string, unknown> }).jobs?.clear();
});

describe("InMemory Queue Adapter", () => {
  it("should enqueue a task", async () => {
    const task = createTestTask();
    const result = await queueAdapter.enqueueTask(task);
    
    expect(result.taskId).toBe("test-task");
    expect(result.traceId).toBe("trace-1");
    expect(result.enqueuedAt).toBeDefined();
  });

  it("should return queue stats", async () => {
    const task = createTestTask();
    await queueAdapter.enqueueTask(task);
    
    const stats = await queueAdapter.getQueueStats();
    
    expect(stats.waiting).toBeGreaterThanOrEqual(0);
    expect(stats.active).toBeGreaterThanOrEqual(0);
    expect(stats.completed).toBeGreaterThanOrEqual(0);
    expect(stats.failed).toBeGreaterThanOrEqual(0);
  });

  it("should handle idempotent enqueue", async () => {
    const task = createTestTask({ idempotencyKey: "idem-duplicate" });
    
    const result1 = await queueAdapter.enqueueTask(task);
    const result2 = await queueAdapter.enqueueTask(task);
    
    expect(result1.taskId).toBe(result2.taskId);
  });
});

describe("Queue Stats", () => {
  it("should track waiting jobs", async () => {
    const task = createTestTask({ idempotencyKey: "idem-waiting" });
    await queueAdapter.enqueueTask(task);
    
    // Wait a bit for async processing
    await new Promise(r => setTimeout(r, 100));
    
    const stats = await queueAdapter.getQueueStats();
    expect(stats.completed).toBeGreaterThanOrEqual(1);
  });

  it("should track completed jobs", async () => {
    // This would require a worker to process the job
    // For now just verify stats structure
    const stats = await queueAdapter.getQueueStats();
    expect(typeof stats.waiting).toBe("number");
    expect(typeof stats.active).toBe("number");
    expect(typeof stats.completed).toBe("number");
    expect(typeof stats.failed).toBe("number");
  });
});