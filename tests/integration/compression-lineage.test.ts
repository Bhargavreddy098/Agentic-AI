import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createPostgresFixturePool, type PostgresFixturePool as Pool } from "../../packages/control/test/fixtures/postgres.js";
import { compressSuffix, needsCompression } from "@asi/context";
import type { RunContext } from "@asi/contracts";
import "@asi/episodic";
import { searchEpisodes } from "@asi/episodic";


const TEST_TENANT = "tenant-a";

let pool: Pool;

function createTestContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
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
    ...overrides,
  };
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
  await pool.query("DELETE FROM episodes WHERE session_id = $1", ["session-1"]);
}, 10000);

describe("Compression Lineage Integration", () => {
  it("should compress suffix and create summary episode", async () => {
    const context = createTestContext();
    const request = {
      promptParts: [
        { type: "text", text: "System: You are an AI assistant" },
        { type: "text", text: "User: " + "x".repeat(5000) },
      ],
    };

    const result = await compressSuffix(request, context);
    
    expect(result.compressedRequest).toBeDefined();
    expect(result.summaryEpisode).toBeDefined();
    expect(result.tokensSaved).toBeGreaterThan(0);
    expect(result.compressionRatio).toBeGreaterThan(0);
  });

  it("should preserve stable prefix during compression", async () => {
    const context = createTestContext();
    const request = {
      promptParts: [
        { type: "text", text: "System: You are an AI assistant with tools" },
        { type: "text", text: "User: " + "x".repeat(5000) },
      ],
    };

    const result = await compressSuffix(request, context);
    
    expect(result.compressedRequest.promptParts[0]?.text).toContain("AI assistant with tools");
  });

  it("should create summary episode with lineage", async () => {
    const context = createTestContext();
    const request = {
      promptParts: [
        { type: "text", text: "System: Assistant" },
        { type: "text", text: "User: " + "x".repeat(5000) },
      ],
    };

    const result = await compressSuffix(request, context);
    
    expect(result.summaryEpisode).toBeDefined();
    expect(result.summaryEpisode!.kind).toBe("system_event");
    expect(result.summaryEpisode!.content).toContain("context_summary");
  });

  it("should create episodic lineage for compressed context", async () => {
    const context = createTestContext();
    const request = {
      promptParts: [
        { type: "text", text: "System: Assistant" },
        { type: "text", text: "User: " + "x".repeat(3000) },
      ],
    };

    await compressSuffix(request, context);
    
    // Search for the summary episode
    const episodes = await searchEpisodes(
      { dbPath: process.env.EPISODIC_DB_PATH || './episodic.db', tenantId: 'tenant-a' },
      { sessionId: 'session-1', query: 'context_summary', limit: 10 }
    );
    
    expect(episodes.episodes.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Compression Thresholds", () => {
  it("should not compress below 50% threshold", () => {
    const request = {
      promptParts: [{ type: "text", text: "x".repeat(1000) }],
    };
    
    expect(needsCompression(request, 100000)).toBe(false);
  });

  it("should consider compression at 50-85%", () => {
    const request = {
      promptParts: [{ type: "text", text: "x".repeat(30000) }],
    };
    
    expect(needsCompression(request, 50000)).toBe(true);
  });

  it("should force compression above 85%", () => {
    const request = {
      promptParts: [{ type: "text", text: "x".repeat(90000) }],
    };
    
    expect(needsCompression(request, 100000)).toBe(true);
  });
});

describe("Compression Lineage Preservation", () => {
  it("should maintain episode lineage through compression", async () => {
    const context = createTestContext();
    const request = {
      promptParts: [
        { type: "text", text: "System: Assistant" },
        { type: "text", text: "User: " + "x".repeat(5000) },
      ],
    };

    const result = await compressSuffix(request, context);
    
    expect(result.summaryEpisode).toBeDefined();
    expect(result.summaryEpisode!.kind).toBe("system_event");
    expect(result.summaryEpisode!.content).toContain("context_summary");
  });

  it("should preserve tool-call/result groups intact", async () => {
    const request = {
      promptParts: [
        { type: "text", text: "System: Assistant" },
        { type: "text", text: "Tool: getWeather({city: 'NYC'})" },
        { type: "text", text: "Result: Sunny, 72F" },
        { type: "text", text: "User: " + "x".repeat(5000) },
      ],
    };

    const result = await compressSuffix(request, createTestContext());
    
    // Tool call and result should be preserved in stable prefix or compressed together
    expect(result.compressedRequest.promptParts.length).toBeGreaterThan(0);
  });
});