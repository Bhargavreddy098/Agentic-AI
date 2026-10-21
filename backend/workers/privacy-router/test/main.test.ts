// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ create: vi.fn(() => { throw new Error("HTTP transport must stay closed"); }) }));
vi.mock("http", () => ({ createServer: transport.create }));
import { startPrivacyRouter } from "../src/main.js";

const owner = { query: async () => ({ rows: [] }) };
const configuration = {
  port: 0,
  dbPool: owner,
  budgetPool: owner,
  localModels: [],
  remoteProviders: [],
  signingKey: new Uint8Array(32).fill(7),
  keyId: "test-transport-key",
  uncertaintyThreshold: 0.8,
  maxStreamingTokens: 4096,
};

describe("Privacy router startup dependencies", () => {
  it.each([Number.NaN, Infinity, -0.01, 1.01])("does not expose HTTP with uncertainty threshold %s", async uncertaintyThreshold => {
    await expect(startPrivacyRouter({ ...configuration, uncertaintyThreshold })).rejects.toThrow("Invalid privacy uncertainty threshold");
    expect(transport.create).not.toHaveBeenCalled();
  });
  it.each([Number.NaN, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("does not expose HTTP with streaming token limit %s", async maxStreamingTokens => {
    await expect(startPrivacyRouter({ ...configuration, maxStreamingTokens })).rejects.toThrow("Invalid privacy streaming token limit");
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("does not expose HTTP without its routing owner", async () => {
    await expect(startPrivacyRouter({ ...configuration, dbPool: null })).rejects.toThrow("Privacy router owner configuration is required");
    expect(transport.create).not.toHaveBeenCalled();
  });
  it("does not expose HTTP without its budget owner", async () => {
    await expect(startPrivacyRouter({ ...configuration, budgetPool: null })).rejects.toThrow("Privacy router owner configuration is required");
    expect(transport.create).not.toHaveBeenCalled();
  });
});
