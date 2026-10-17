import { describe, it, expect, vi } from "vitest";
import type { Episode, RunContext } from "@asi/contracts";
import * as episodic from "@asi/episodic";
import {
  countTokens,
  shouldCompress,
  extractStablePrefix,
  countRequestTokens,
} from "@asi/context";
import { compressSuffix, needsCompression } from "@asi/context";
import { reconstructContext } from "@asi/context";
import { assembleContext } from "@asi/context";

describe("Context Tokens", () => {
  it("should count tokens approximately", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0);
    expect(countTokens("")).toBe(0);
    expect(countTokens("a".repeat(100))).toBe(25);
  });

  it("should determine compression correctly", () => {
    expect(shouldCompress(49, 100)).toBe('none');
    expect(shouldCompress(50, 100)).toBe('consider');
    expect(shouldCompress(85, 100)).toBe('consider');
    expect(shouldCompress(86, 100)).toBe('force');
  });

  it("should extract stable prefix", () => {
    const request = {
      promptParts: [
        { type: 'text', text: 'System instructions' },
        { type: 'text', text: 'User message' },
      ],
    };
    
    const { stablePrefix, remainingParts } = extractStablePrefix(request);
    expect(stablePrefix).toBe('System instructions');
    expect(remainingParts).toHaveLength(1);
    expect(remainingParts[0]?.text).toBe('User message');
  });

  it("should count request tokens", () => {
    const request = {
      promptParts: [
        { type: 'text', text: 'Hello world' },
      ],
      maxOutputTokens: 100,
    };
    
    const tokens = countRequestTokens(request);
    expect(tokens.prompt).toBeGreaterThan(0);
    expect(tokens.reserved).toBe(100);
    expect(tokens.total).toBe(tokens.prompt + tokens.reserved);
  });
});

describe("Context Compression", () => {
  it("should detect when compression is needed", () => {
    const request = {
      promptParts: Array(1000).fill({ type: 'text', text: 'x'.repeat(100) }),
    };
    
    expect(needsCompression(request, 10000)).toBe(true);
  });

  it("should not compress small requests", () => {
    const request = {
      promptParts: [{ type: 'text', text: 'Hello' }],
    };
    
    expect(needsCompression(request, 100000)).toBe(false);
  });

  it("should compress suffix while preserving stable prefix", async () => {
    const request = {
      promptParts: [
        { type: 'text', text: 'System: You are an AI assistant' },
        { type: 'text', text: 'User: ' + 'x'.repeat(10000) },
      ],
    };
    
    const context = {
      runId: 'run-1',
      sessionId: 'session-1',
      writerEpoch: 1,
      mode: 'execute' as const,
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: 'tenant-1',
        accountId: 'account-1',
        rootRunId: 'root-1',
      },
    };
    
    const result = await compressSuffix(request, context);
    expect(result.compressedRequest).toBeDefined();
    expect(result.tokensSaved).toBeGreaterThanOrEqual(0);
  });
});

describe("Context Recall", () => {
  it("should reconstruct context from episodes", () => {
    const episodes: Array<{ episode: Pick<Episode, "kind" | "content">; relevanceScore: number }> = [
      { episode: { kind: 'user_message', content: 'User said hello' }, relevanceScore: 1 },
      { episode: { kind: 'tool_result', content: 'Tool returned 42' }, relevanceScore: 0.8 },
    ];
    
    const context = reconstructContext(episodes, 1000);
    expect(context).toContain('user_message');
    expect(context).toContain('tool_result');
  });

  it("should respect token limit in reconstruction", () => {
    const episodes = Array(100).fill({
      episode: { kind: 'user_message', content: 'x'.repeat(100) },
      relevanceScore: 1,
    });
    
    const context = reconstructContext(episodes, 100); // Very small limit
    expect(context.length).toBeLessThan(500);
  });
});

describe("Context Assembly", () => {
  it("should assemble context with stable prefix", async () => {
    const context = {
      runId: 'run-1',
      sessionId: 'session-1',
      writerEpoch: 1,
      mode: 'execute' as const,
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: 'tenant-1',
        accountId: 'account-1',
        rootRunId: 'root-1',
      },
    };
    
    const result = await assembleContext(context, 'Hello world');
    expect(result.request).toBeDefined();
    expect(result.stablePrefix).toBeDefined();
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("should include stable prefix in assembled context", async () => {
    const context = {
      runId: 'run-1',
      sessionId: 'session-1',
      writerEpoch: 1,
      mode: 'execute' as const,
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: 'tenant-1',
        accountId: 'account-1',
        rootRunId: 'root-1',
      },
    };
    
    const result = await assembleContext(context, 'Test message');
    expect(result.stablePrefix).toContain('AI assistant');
  });
});

describe("Context boundary regressions", () => {
  const context: RunContext = {
    runId: "run-boundary",
    sessionId: "session-boundary",
    writerEpoch: 2,
    mode: "execute",
    deadlineAt: new Date(Date.now() + 3600000).toISOString(),
    budgetRef: { tenantId: "tenant-boundary", accountId: "account-boundary", rootRunId: "root-boundary" },
  };

  const episode: Episode = {
    schemaVersion: 1,
    tenantId: "tenant-boundary",
    sessionId: "session-boundary",
    episodeId: "ep-boundary",
    sequence: 1,
    kind: "system_event",
    content: "Remember the boundary-specific instruction",
    sourceIds: ["source-boundary"],
    createdAt: "2026-10-10T00:00:00.000Z",
  };

  it("rejects recalled content until trusted output authority can be bound", async () => {
    const search = vi.spyOn(episodic, "searchEpisodes").mockImplementation(async (config, input) => {
      if (config.tenantId !== "tenant-boundary" || input.sessionId !== "session-boundary") {
        return { episodes: [], totalMatches: 0 };
      }
      return { episodes: [{ episode, rank: 0, matchSnippet: "Remember the boundary-specific instruction" }], totalMatches: 1 };
    });
    try {
      await expect(assembleContext(context, "Use my prior instruction")).rejects.toThrow(
        "Recalled content requires trusted output authority binding"
      );
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-boundary" }),
        expect.objectContaining({ sessionId: "session-boundary" })
      );
    } finally {
      search.mockRestore();
    }
  });

  it("persists one summary episode for a compression", async () => {
    const writtenEpisodes: Episode[] = [];
    const append = vi.spyOn(episodic, "appendEpisode").mockImplementation(async (config, input) => {
      const storedEpisode: Episode = {
        schemaVersion: 1,
        tenantId: config.tenantId,
        sessionId: input.sessionId,
        episodeId: input.command.episodeId,
        sequence: writtenEpisodes.length + 1,
        kind: input.command.kind,
        content: input.command.content,
        sourceIds: [input.command.sourceEventId],
        createdAt: "2026-10-10T00:00:00.000Z",
      };
      writtenEpisodes.push(storedEpisode);
      return {
        episode: storedEpisode,
        receipt: {
          episodeId: storedEpisode.episodeId,
          commandId: input.command.commandId,
          sequence: storedEpisode.sequence,
          contentHash: "0".repeat(64),
          signature: "test-signature",
        },
      };
    });
    try {
      const result = await compressSuffix({ promptParts: [
        { type: "text", text: "System: preserve this prefix" },
        { type: "text", text: "x".repeat(240000) },
      ] }, context);
      expect(writtenEpisodes).toHaveLength(1);
      expect(result.summaryEpisode).toEqual(writtenEpisodes[0]);
      expect(result.compressedRequest.promptParts[0]?.text).toBe("System: preserve this prefix");
      expect(result.tokensSaved).toBeGreaterThan(0);
    } finally {
      append.mockRestore();
    }
  });

  it("skips episodes with no text when reconstructing context", () => {
    const result = reconstructContext([
      { episode: { kind: "tool_result" } },
      { episode: { kind: "user_message", content: "Keep this text" } },
    ], 1000);
    expect(result).toBe("user_message: Keep this text");
  });
});
