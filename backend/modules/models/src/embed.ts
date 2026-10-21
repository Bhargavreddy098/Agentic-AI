import { type RouteInferenceInput, type RouteInferenceResult } from "@asi/privacy";


export interface EmbedConfig {
  localModels: EmbedLocalModelConfig[];
  remoteProviders: EmbedRemoteProviderConfig[];
  privacyRouter: {
    routeInference: (input: RouteInferenceInput) => Promise<RouteInferenceResult>;
  };
}

export interface EmbedLocalModelConfig {
  modelId: string;
  modelClass: "embedding";
  endpoint: string;
  capabilities: string[];
  maxTokens: number;
  costPerTokenMicroUsd: number;
  dimensions: number;
}

export interface EmbedRemoteProviderConfig {
  providerId: string;
  name: string;
  models: RemoteEmbedModelConfig[];
  credentialsRef: string;
  region: string;
  costPerTokenMicroUsd: number;
}

export interface EmbedConfigInput {
  modelClass: "embedding";
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

export interface EmbedResult {
  embeddings: number[][];
  usageTokens: { inputTokens: number; outputTokens: number };
  costMicroUsd: number;
  modelId: string;
  modelRevision: string;
  dimensions: number;
}

export interface RemoteEmbedModelConfig {
  modelId: string;
  modelClass: "embedding";
  maxTokens: number;
  supportedSensitivities: string[];
  dimensions: number;
  costPerTokenMicroUsd: number;
}

export async function embedText(
  config: EmbedConfig,
  principal: {
    tenantId: string;
    subjectId: string;
    roles: string[];
    capabilities: string[];
    audience: string;
    expiresAt: string;
    authenticatedSource: string;
  },
  context: {
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
  },
  text: string,
  sensitivity: "public" | "internal" | "confidential" | "restricted"
): Promise<{ vector: number[]; modelId: string }> {
  // Route the embedding request through privacy router using unified interface
  const routeResult = await config.privacyRouter.routeInference({
    principal: {
      tenantId: principal.tenantId,
      subjectId: principal.subjectId,
      roles: principal.roles,
      capabilities: principal.capabilities,
      audience: principal.audience,
      expiresAt: principal.expiresAt,
      authenticatedSource: principal.authenticatedSource,
    },
    request: {
      modelClass: "embedding",
      promptParts: [{ type: "text", text }],
      stablePrefix: "",
      sensitivity,
      maxOutputTokens: 0,
      runContext: {
        runId: context.runId,
        sessionId: context.sessionId,
        writerEpoch: context.writerEpoch,
        mode: context.mode,
        deadlineAt: context.deadlineAt,
        budgetRef: context.budgetRef,
      },
      budgetReservation: {
        reservationId: `res-${Date.now()}`,
        budgetRef: context.budgetRef,
        reservedTokens: Math.ceil(text.length / 4),
        reservedCostMicroUsd: 100,
        status: "reserved",
      },
      traceId: `trace-${Date.now()}`,
    },
  } as RouteInferenceInput);

  if (!routeResult.allowed) {
    throw new Error(`Embedding routing denied: ${routeResult.denialReason}`);
  }

  // For now, return a mock embedding - actual implementation would call local or remote model
  const dimensions = 1536;
  const vector = new Array(dimensions).fill(0).map(() => Math.random() * 2 - 1);

  return {
    vector,
    modelId: routeResult.modelId,
  };
}