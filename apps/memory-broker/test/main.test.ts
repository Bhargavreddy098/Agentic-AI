import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { MemoryQuery, Principal } from "@asi/contracts";
import type { QueryMemoryInput } from "@asi/memory";
import { startMemoryBroker } from "../src/main.js";
import { createPostgresFixturePool } from "../../../packages/control/test/fixtures/postgres.js";

type Request = { url: string; method: string; headers: Record<string, string>; [Symbol.asyncIterator](): AsyncGenerator<string> };
type Response = { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void };
type Listener = (request: Request, response: Response) => Promise<void>;
const transport = vi.hoisted((): { listener?: Listener } => ({}));
const owner = vi.hoisted((): { query: QueryMemoryInput[] } => ({ query: [] }));

vi.mock("http", () => {
  function createServer(listener: Listener) {
    transport.listener = listener;
    return { listen() {}, close() {} };
  }
  return { createServer, default: { createServer } };
});
vi.mock("@asi/memory", () => ({
  async queryMemory(_config: unknown, input: QueryMemoryInput) {
    owner.query.push(input);
    return { records: [] };
  },
  async publishMemory() { return {}; },
  async revertMemoryRevision() { return {}; },
}));

const pool = createPostgresFixturePool({ max: 1 });
const signingKey = new Uint8Array(32).fill(8);
const deadline = new Date(Date.now() + 3600000).toISOString();
const principal: Principal = { tenantId: "tenant-a", subjectId: "subject-1", roles: ["user"], capabilities: ["memory:query"], audience: "memory-broker", expiresAt: deadline, authenticatedSource: "test-source" };
const query: MemoryQuery = {
  schemaVersion: 1,
  query: { type: "text", text: "hello" },
  requestedScopes: ["Global"],
  limit: 10,
  runContext: { runId: "run-1", sessionId: "session-1", writerEpoch: 1, mode: "execute", deadlineAt: deadline, budgetRef: { tenantId: "tenant-a", accountId: "account-1", rootRunId: "run-1" } },
};

async function request(value: unknown) {
  await startMemoryBroker({ port: 8083, dbPool: pool, signingKey, keyId: "test-key" });
  const body = JSON.stringify(value);
  const signature = createHmac("sha256", signingKey).update(body).digest("hex");
  const listener = transport.listener;
  if (!listener) throw new Error("Expected captured HTTP handler");
  let statusCode = 0;
  await listener({ url: "/memory/query", method: "POST", headers: { "x-signature": signature }, async *[Symbol.asyncIterator]() { yield body; } }, {
    writeHead(status) { statusCode = status; },
    end() {},
  });
  return statusCode;
}

beforeEach(() => {
  owner.query.length = 0;
  vi.spyOn(process, "on").mockImplementation(() => process);
  delete transport.listener;
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await pool.end(); });

describe("memory broker query request construction", () => {
  it("omits an absent owner limit", async () => {
    expect(await request({ principal, query })).toBe(200);
    expect(owner.query[0]).toEqual({ principal, query });
    expect(Object.hasOwn(owner.query[0] ?? {}, "limit")).toBe(false);
  });

  it("preserves an explicit owner limit", async () => {
    expect(await request({ principal, query, limit: 7 })).toBe(200);
    expect(owner.query[0]?.limit).toBe(7);
  });
});

describe("memory broker startup boundary", () => {
  it("rejects a missing owner pool before constructing HTTP transport", async () => {
    await expect(startMemoryBroker({ port: 8083, dbPool: null, signingKey, keyId: "test-key" })).rejects.toThrow("Memory broker requires an initialized owner database pool");
    expect(transport.listener).toBeUndefined();
    expect(owner.query).toHaveLength(0);
  });
});
