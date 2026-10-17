

export interface ProviderAdapter {
  providerId: string;
  name: string;
  models: ProviderModel[];
  capabilities: string[];
  authenticate(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export interface ProviderModel {
  modelId: string;
  modelClass: "generation" | "embedding" | "reasoning" | "classification";
  maxTokens: number;
  supportedSensitivities: string[];
  costPerTokenMicroUsd: number;
  dimensions?: number;
  capabilities: string[];
}

export interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  audio: boolean;
  maxContextTokens: number;
  supportedSensitivities: string[];
}

export interface ProviderCredentials {
  providerId: string;
  apiKeyRef: string;
  endpoint: string;
  region: string;
  organizationId?: string;
}

export interface ProviderHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  lastCheck: string;
  errorRate: number;
}

export interface ProviderRateLimit {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrentRequests: number;
}

export interface ProviderInvocation {
  modelId: string;
  prompt: string;
  parameters: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
    stopSequences?: string[];
    stream?: boolean;
  };
  metadata: {
    traceId: string;
    requestId: string;
    tenantId: string;
  };
}

export interface ProviderResponse {
  content: string;
  finishReason: "stop" | "length" | "error" | "cancelled" | "content_filter";
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  costMicroUsd: number;
  modelRevision: string;
  latencyMs: number;
}

export interface ProviderStreamChunk {
  delta: string;
  finishReason?: "stop" | "length" | "error" | "cancelled" | "content_filter";
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ProviderError {
  code: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
}

export interface ProviderClient {
  invoke(invocation: ProviderInvocation): Promise<ProviderResponse>;
  stream(invocation: ProviderInvocation): AsyncGenerator<ProviderStreamChunk, void, unknown>;
  getCapabilities(): ProviderCapabilities;
  getModels(): ProviderModel[];
  healthCheck(): Promise<ProviderHealth>;
  authenticate(): Promise<void>;
}

export interface LocalModelAdapter extends ProviderAdapter {
  modelId: string;
  endpoint: string;
  capabilities: string[];
  loadModel(): Promise<void>;
  unloadModel(): Promise<void>;
  getMemoryUsage(): number;
}

export interface ModelRegistry {
  registerProvider(adapter: ProviderAdapter): void;
  unregisterProvider(providerId: string): void;
  getProvider(providerId: string): ProviderAdapter | undefined;
  listProviders(): ProviderAdapter[];
  getModel(modelId: string): ProviderModel | undefined;
  listModels(): ProviderModel[];
  getCapabilities(providerId: string): ProviderCapabilities | undefined;
}

export interface ProviderConfig {
  providerId: string;
  name: string;
  credentials: ProviderCredentials;
  models: ProviderModel[];
  capabilities: ProviderCapabilities;
  rateLimits: ProviderRateLimit;
  healthCheckIntervalMs: number;
  retryPolicy: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryableErrors: string[];
  };
  timeoutMs: number;
}

export interface ProviderPool {
  config: ProviderConfig;
  clients: Map<string, ProviderClient>;
  health: ProviderHealth;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgLatencyMs: number;
    totalCostMicroUsd: number;
  };
}

export interface ProviderClient {
  invoke(invocation: ProviderInvocation): Promise<ProviderResponse>;
  stream(invocation: ProviderInvocation): AsyncGenerator<ProviderStreamChunk, void, unknown>;
  getCapabilities(): ProviderCapabilities;
  getModels(): ProviderModel[];
  healthCheck(): Promise<ProviderHealth>;
  authenticate(): Promise<void>;
}