import type { RunContext, TaskEnvelope } from "@asi/contracts";
import "./tokens.js";
import "./compress.js";
import "./recall.js";

export interface AssemblyConfig {
  maxContextTokens: number;
  reserveTokensForOutput: number;
  enableRecall: boolean;
  enableCompression: boolean;
}

export interface AssemblyResult {
  request: TaskEnvelope;
  stablePrefix: string;
  compressed: boolean;
  tokensUsed: number;
  tokensRemaining: number;
  recalledEpisodes: number;
}

export async function assembleContext(
  context: RunContext,
  userInput: string,
  userConfig: Partial<AssemblyConfig> = {}
): Promise<AssemblyResult> {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  
  // Build stable prefix (system instructions, tool definitions)
  const stablePrefix = buildStablePrefix();
  const stablePrefixTokens = Math.ceil(stablePrefix.length / 4);
  let currentTokens = stablePrefixTokens;
  
  let compressed = false;
  const currentContext = '';
  const recalledEpisodes = 0;
  
  // Recall relevant episodes if enabled
  if (config.enableRecall) {
    const { recall: recallFunc } = await import("./recall.js");
    const recallResult = await recallFunc(
      "relevant context for current task",
      context
    );
    
    // This legacy builder has no authenticated principal to bind to recalled data.
    // Refuse to forward memory under its fabricated output authority.
    if (recallResult.episodes.length > 0) {
      throw new Error("Recalled content requires trusted output authority binding");
    }
  }

  // Add current context (if any compressed or recalled)
  const contextTokens = Math.ceil(currentContext.length / 4);
  currentTokens += contextTokens;
  
  // Check if we need compression
  const remainingTokens = 100000 - currentTokens;
  
  if (remainingTokens < 10000) {
    // Would need compression, but for now just mark it
    compressed = true;
  }
  
  // Known limitation: returned run context and principal still need trusted-owner integration.
  // Build final request
  const request: TaskEnvelope = {
    schemaVersion: 1,
    taskId: `task-${Date.now()}`,
    traceId: `trace-${Date.now()}`,
    correlationId: `corr-${Date.now()}`,
    causationId: `cause-${Date.now()}`,
    runContext: {
      runId: `run-${Date.now()}`,
      sessionId: "session-1",
      writerEpoch: 1,
      mode: "execute" as const,
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: "system",
        accountId: "default",
        rootRunId: "root",
      },
    },
    requiredCapabilities: ["tool:execution"],
    input: {
      text: `System: ${buildStablePrefix()}\n\nContext:\n${currentContext}\n\nUser: ${userInput}`,
    },
    principalGrant: {
      tenantId: "system",
      subjectId: "user",
      roles: ["user"],
      capabilities: ["tool:execution"],
      audience: "orchestrator",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "gateway",
    },
    idempotencyKey: `idem-${Date.now()}`,
  };
  
  return {
    request,
    stablePrefix: buildStablePrefix(),
    compressed,
    tokensUsed: Math.ceil((buildStablePrefix() + userInput).length / 4),
    tokensRemaining: 100000 - Math.ceil((buildStablePrefix() + userInput).length / 4),
    recalledEpisodes,
  };
}

export function buildStablePrefix(): string {
  return `You are an AI assistant with access to tools. Follow the system instructions carefully.`;
}

export const DEFAULT_CONFIG = {
  maxContextTokens: 100000,
  reserveTokensForOutput: 2000,
  enableRecall: true,
  enableCompression: true,
};

export const buildStablePrefixExport = buildStablePrefix;
