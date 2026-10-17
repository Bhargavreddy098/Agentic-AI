import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { EpisodeCommand } from "@asi/contracts";
import type { AppendEpisodeInput, SearchEpisodesInput, GetSessionEpisodesInput } from "@asi/episodic";
import { startEpisodicOwner } from "../src/main.js";

type Request = { url: string; method: string; headers: Record<string, string>; [Symbol.asyncIterator](): AsyncGenerator<string> };
type Response = { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void };
type Listener = (request: Request, response: Response) => Promise<void>;
const transport = vi.hoisted((): { listener?: Listener } => ({}));
const owner = vi.hoisted((): { append: AppendEpisodeInput[]; search: SearchEpisodesInput[]; get: GetSessionEpisodesInput[] } => ({ append: [], search: [], get: [] }));

vi.mock("http", () => {
  function createServer(listener: Listener) {
    transport.listener = listener;
    return { listen() {}, close() {} };
  }
  return { createServer, default: { createServer } };
});
vi.mock("@asi/episodic", () => ({
  async appendEpisode(_config: unknown, input: AppendEpisodeInput) {
    owner.append.push(input);
    return { receipt: { episodeId: input.command.episodeId }, episode: { episodeId: input.command.episodeId } };
  },
  async searchEpisodes(_config: unknown, input: SearchEpisodesInput) {
    owner.search.push(input);
    return { episodes: [], totalMatches: 0 };
  },
  async getSessionEpisodes(_config: unknown, input: GetSessionEpisodesInput) {
    owner.get.push(input);
    return { episodes: [], totalMatches: 0 };
  },
  async recordCompression() { return { compression: {} }; },
}));

const signingKey = new Uint8Array(32).fill(7);
const deadline = new Date(Date.now() + 3600000).toISOString();
const command: EpisodeCommand = {
  schemaVersion: 1,
  commandId: "command-1",
  principal: { tenantId: "tenant-a", subjectId: "subject-1", roles: ["user"], capabilities: ["episodic:append"], audience: "episodic-owner", expiresAt: deadline, authenticatedSource: "test-source" },
  runContext: { runId: "run-1", sessionId: "session-1", writerEpoch: 1, mode: "execute", deadlineAt: deadline, budgetRef: { tenantId: "tenant-a", accountId: "account-1", rootRunId: "run-1" } },
  episodeId: "episode-1",
  kind: "user_message",
  content: "Hello",
  sourceEventId: "event-1",
  artifactRefs: [{ artifactId: "artifact-1", contentHash: "a".repeat(64) }],
};

async function request(path: string, value: unknown, method = "POST") {
  const body = JSON.stringify(value);
  const signature = createHmac("sha256", signingKey).update(body).digest("hex");
  const listener = transport.listener;
  if (!listener) throw new Error("Expected captured HTTP handler");
  let statusCode = 0;
  await listener({ url: path, method, headers: { "x-signature": signature }, async *[Symbol.asyncIterator]() { yield body; } }, {
    writeHead(status) { statusCode = status; },
    end() {},
  });
  return statusCode;
}

beforeEach(async () => {
  owner.append.length = 0;
  owner.search.length = 0;
  owner.get.length = 0;
  vi.spyOn(process, "on").mockImplementation(() => process);
  await startEpisodicOwner({ port: 8082, dbPath: "unused-test.db", tenantId: "tenant-a", signingKey, keyId: "test-key" });
});
afterEach(() => vi.restoreAllMocks());

describe("episodic owner request boundaries", () => {
  it("forwards the complete canonical append command", async () => {
    expect(await request("/episodes/append", { sessionId: "session-1", command })).toBe(200);
    expect(owner.append).toEqual([{ sessionId: "session-1", command }]);
  });

  it.each(["schemaVersion", "episodeId", "kind", "sourceEventId"])("rejects append without required %s before owner execution", async field => {
    const incomplete: Record<string, unknown> = { ...command };
    delete incomplete[field];
    expect(await request("/episodes/append", { sessionId: "session-1", command: incomplete })).toBe(500);
    expect(owner.append).toHaveLength(0);
  });

  it("rejects a noncanonical search kind before owner execution", async () => {
    expect(await request("/episodes/search", { sessionId: "session-1", query: "hello", kind: "arbitrary" })).toBe(500);
    expect(owner.search).toHaveLength(0);
  });

  it("omits absent optional search kind and preserves the default limit", async () => {
    expect(await request("/episodes/search", { sessionId: "session-1", query: "hello" })).toBe(200);
    expect(owner.search[0]).toEqual({ sessionId: "session-1", query: "hello", limit: 50 });
    expect(Object.hasOwn(owner.search[0] ?? {}, "kind")).toBe(false);
  });

  it("passes canonical search kinds", async () => {
    expect(await request("/episodes/search", { sessionId: "session-1", query: "hello", kind: "tool_result" })).toBe(200);
    expect(owner.search[0]?.kind).toBe("tool_result");
  });

  it("rejects a noncanonical GET kind before owner execution", async () => {
    expect(await request("/episodes?sessionId=session-1&kind=arbitrary", {}, "GET")).toBe(500);
    expect(owner.get).toHaveLength(0);
  });

  it("omits absent optional GET kind", async () => {
    expect(await request("/episodes?sessionId=session-1", {}, "GET")).toBe(200);
    expect(owner.get[0]).toEqual({ sessionId: "session-1", limit: 50, offset: 0 });
    expect(Object.hasOwn(owner.get[0] ?? {}, "kind")).toBe(false);
  });
});
