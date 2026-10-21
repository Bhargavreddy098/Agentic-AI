import type { Episode, RunContext } from "@asi/contracts";
import "@asi/episodic";
import { countTokens, shouldCompress, extractStablePrefix, countRequestTokens, type ContextTokenInput, type ContextTextPart } from "./tokens.js";

export interface CompressionConfig {
  maxSummaryTokens: number;
  minCompressionRatio: number;
}

export interface CompressionResult<T extends ContextTokenInput = ContextTokenInput> {
  compressedRequest: T | (Omit<T, "promptParts"> & { promptParts: ContextTextPart[] });
  summaryEpisode: Episode | null;
  tokensSaved: number;
  compressionRatio: number;
}

/**
 * Compresses the suffix of a request while preserving the stable prefix.
 * Current limitation: summarization truncates locally; privacy-router integration is unfinished.
 */
export async function compressSuffix<T extends ContextTokenInput>(
  request: T,
  context: RunContext,
): Promise<CompressionResult<T>> {
  // Extract stable prefix and compressible suffix
  const { stablePrefix, remainingParts } = extractStablePrefix(request);
  
  // Join the compressible parts
  const compressibleText = remainingParts.map((p) => p.text || '').join('\n');
  
  if (!compressibleText.trim()) {
    return {
      compressedRequest: request,
      summaryEpisode: null,
      tokensSaved: 0,
      compressionRatio: 1,
    };
  }
  
  // Check if compression is needed
  const tokenCounts = countRequestTokens({ promptParts: remainingParts });
  const windowTokens = 100000; // Approximate context window
  const decision = shouldCompress(tokenCounts.total, windowTokens);
  
  if (decision === 'none') {
    return {
      compressedRequest: request,
      summaryEpisode: null,
      tokensSaved: 0,
      compressionRatio: 1,
    };
  }
  
  // Apply the current local summary placeholder.
  const summary = await summarizeThroughRouter(compressibleText);
  
  // Create summary episode for recall
  const summaryEpisode = await createSummaryEpisode(
    summary,
    context,
    tokenCounts.prompt
  );
  
  // Build compressed request
  const compressedRequest = {
    ...request,
    promptParts: [
      { type: 'text', text: stablePrefix },
      { type: 'text', text: `\n[Compressed Context Summary]\n${summary}\n` },
    ],
  };
  
  const originalTokens = countTokens(stablePrefix + compressibleText);
  const newTokens = countTokens(stablePrefix + summary);
  const tokensSaved = originalTokens - newTokens;
  const compressionRatio = tokensSaved / originalTokens;
  
  return {
    compressedRequest,
    summaryEpisode,
    tokensSaved,
    compressionRatio,
  };
}

/**
 * Placeholder extractive summary; the supplied authority is not yet used by a privacy router.
 */
async function summarizeThroughRouter(text: string): Promise<string> {
  // In a real implementation, this would call the privacy router
  // with a summarization model class
  // For now, return a truncated summary
  const maxLength = 500;
  if (text.length <= maxLength) return text;
  
  // Simple extractive summary - take first and last portions
  const keepStart = Math.floor(500 * 0.7);
  const keepEnd = 500 - keepStart;
  
  return text.substring(0, keepStart) + '\n[... compressed ...]\n' + text.substring(text.length - keepEnd);
}

/**
 * Creates an episode for the summary to enable recall.
 */
async function createSummaryEpisode(
  summary: string,
  context: RunContext,
  originalTokens: number
): Promise<Episode> {
  const { appendEpisode } = await import("@asi/episodic");
  
  const config = {
    dbPath: process.env.EPISODIC_DB_PATH || "./episodic.db",
    tenantId: "system",
    signingKey: new Uint8Array(32),
    keyId: "context",
  };

  const episode = await appendEpisode(config, {
    sessionId: context.sessionId,
    command: {
      schemaVersion: 1,
      commandId: `cmd-${Date.now()}`,
      episodeId: `ep-${Date.now()}`,
      kind: "system_event",
      content: JSON.stringify({
        type: "context_summary",
        summary,
        originalTokens,
        timestamp: new Date().toISOString(),
      }),
      sourceEventId: "init",
      ingressAuthority: "context-compressor",
      principal: {
        tenantId: "system",
        subjectId: "compressor",
        roles: ["system"],
        capabilities: ["context:compress"],
        audience: "context",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        authenticatedSource: "context-compressor",
      },
    },
  });
  
  return episode.episode;
}

/**
 * Determines if a request needs compression.
 */
export function needsCompression(request: ContextTokenInput, windowTokens: number): boolean {
  const tokenCounts = countRequestTokens(request);
  return shouldCompress(tokenCounts.total, windowTokens) !== 'none';
}