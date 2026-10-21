export {
  generate,
  type GenerateConfig,
  type GenerateConfigInput,
  type GenerateResult,
  type ProviderModelRevision,
  type LocalModelConfig,
  type RemoteProviderConfig,
  type RemoteModelConfig,
} from "./generate.js";

export {
  embedText,
  type EmbedConfig,
  type EmbedConfigInput,
  type EmbedResult,
  type EmbedLocalModelConfig,
  type EmbedRemoteProviderConfig,
  type RemoteEmbedModelConfig,
} from "./embed.js";

export {
  type ProviderAdapter,
  type ProviderModel,
  type ProviderCapabilities,
  type ProviderCredentials,
  type ProviderHealth,
  type ProviderRateLimit,
  type ProviderInvocation,
  type ProviderResponse,
  type ProviderStreamChunk,
  type ProviderError,
  type ProviderClient,
  type LocalModelAdapter,
  type ModelRegistry,
  type ProviderConfig,
  type ProviderPool,
} from "./providers.js";