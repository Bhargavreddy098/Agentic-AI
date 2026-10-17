export * from "./mcp/client.js";
export * from "./mcp/server.js";
export * from "./mcp/auth.js";
export * from "./mcp/versions.js";

export { A2A_AGENT_CARD_SCHEMA_VERSION, A2AAgentCardSchema, validateAgentCard, sanitizeAgentCard } from "./a2a/card.js";
export type { A2AAgentCard } from "./a2a/card.js";

export { isPublicA2aAddress, createA2aFetch } from "./a2a/auth.js";
export type { A2AEndpoint, A2AIdentity, A2ANetwork, A2AResourceCredential } from "./a2a/auth.js";

export { createA2aClient } from "./a2a/client.js";
export type { A2AClientAdapter, A2AClientConfig, A2AClientServices, A2ARemoteAgent } from "./a2a/client.js";

export { createA2aServer } from "./a2a/server.js";
export type { A2AServerConfig, A2AServerServices, AuthenticatedA2aToken } from "./a2a/server.js";

export {
  checkedA2aStatus, isTerminalA2aStatus, mapA2aToLocal, mapLocalToA2a,
  createRemoteTaskState, updateRemoteTaskState,
} from "./a2a/state-map.js";
export type { A2ATaskStatus, RemoteTaskState } from "./a2a/state-map.js";

export { A2A_REVISION, assertA2aRevision } from "./a2a/versions.js";
