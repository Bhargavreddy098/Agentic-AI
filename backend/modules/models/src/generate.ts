import { createHash } from "node:crypto";
import { type RouteInferenceInput, type RouteResult } from "@asi/privacy";


export interface GenerateConfig {
  localModels: LocalModelConfig[];
  remoteProviders: RemoteProviderConfig[];
  privacyRouter: {
    routeInference: (input: RouteInferenceInput) => Promise<RouteResult>;
  };
}

export interface GenerateConfigInput {
  modelClass: "generation" | "embedding" | "reasoning" | "classification";
  promptParts: Array<{ type: "text"; text: string }>;
  stablePrefix: string;
  sensitivity: "public" | "internal" | "confidential" | "restricted";
  maxOutputTokens: number;
  runContext: {
    runId: string;
    sessionId: string;
    writerEpoch: number;
    mode: "observe" | "assist" | "execute";
    deadlineAt: string;
    budgetRef: {
      tenantId: string;
      accountId: string;
      rootRunId: string;
    };
  };
  budgetReservation: {
    reservationId: string;
    budgetRef: {
      tenantId: string;
      accountId: string;
      rootRunId: string;
    };
    reservedTokens: number;
    reservedCostMicroUsd: number;
    status: "reserved" | "settled" | "unknown";
  };
  traceId: string;
}

export interface GenerateResult {
  resultId: string;
  outputRefs: Array<{ artifactId: string; contentHash: string }>;
  usageTokens: { inputTokens: number; outputTokens: number };
  costMicroUsd: number;
  providerModelRevision: ProviderModelRevision;
  finishReason: "stop" | "length" | "error" | "cancelled" | "content_filter";
}

export interface ProviderModelRevision {
  providerId: string;
  modelId: string;
  revision: string;
  capabilities: string[];
  maxTokens: number;
  costPerTokenMicroUsd: number;
}

export interface LocalModelConfig {
  modelId: string;
  modelClass: "generation" | "embedding" | "reasoning" | "classification";
  endpoint: string;
  capabilities: string[];
  maxTokens: number;
  costPerTokenMicroUsd: number;
}

export interface RemoteProviderConfig {
  providerId: string;
  name: string;
  models: RemoteModelConfig[];
  credentialsRef: string;
  region: string;
  costPerTokenMicroUsd: number;
}

export interface RemoteModelConfig {
  modelId: string;
  modelClass: "generation" | "embedding" | "reasoning" | "classification";
  maxTokens: number;
  maxOutputTokens: number;
  supportedSensitivities: string[];
  costPerTokenMicroUsd: number;
}

export async function generate(
  config: GenerateConfig,
  input: {
    modelClass: "generation" | "embedding" | "reasoning" | "classification";
    promptParts: Array<{ type: "text"; text: string }>;
    stablePrefix: string;
    sensitivity: "public" | "internal" | "confidential" | "restricted";
    maxOutputTokens: number;
    runContext: {
      runId: string;
      sessionId: string;
      writerEpoch: number;
      mode: "observe" | "assist" | "execute";
      deadlineAt: string;
      budgetRef: {
        tenantId: string;
        accountId: string;
        rootRunId: string;
      };
    };
    budgetReservation: {
      reservationId: string;
      budgetRef: {
        tenantId: string;
        accountId: string;
        rootRunId: string;
      };
      reservedTokens: number;
      reservedCostMicroUsd: number;
      status: "reserved" | "settled" | "unknown";
    };
    traceId: string;
    principal: {
      tenantId: string;
      subjectId: string;
      roles: string[];
      capabilities: string[];
      audience: string;
      expiresAt: string;
      authenticatedSource: string;
    };
  }): Promise<GenerateResult> {
  // Route the inference through privacy router
  const routeResult = await config.privacyRouter.routeInference({
    principal: input.principal,
    request: {
      modelClass: input.modelClass,
      promptParts: input.promptParts,
      stablePrefix: input.stablePrefix,
      sensitivity: input.sensitivity,
      maxOutputTokens: input.maxOutputTokens,
      runContext: input.runContext,
      budgetReservation: input.budgetReservation,
      traceId: input.traceId,
    },
  });

  if (!routeResult.allowed) {
    throw new Error(`Inference routing denied: ${routeResult.denialReason}`);
  }

  // For now, return a mock result - actual implementation would call local or remote model
  const resultId = `result-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const contentHash = createHash("sha256").update("generated content").digest("hex");

  return {
    resultId,
    outputRefs: [{ artifactId: `artifact-${Date.now()}`, contentHash }],
    usageTokens: { inputTokens: 100, outputTokens: 50 },
    costMicroUsd: 2500,
    providerModelRevision: {
      providerId: routeResult.providerId ?? "local",
      modelId: routeResult.modelId,
      revision: "1.0.0",
      capabilities: ["generation"],
      maxTokens: 4096,
      costPerTokenMicroUsd: 10,
    },
    finishReason: "stop",
  };
}