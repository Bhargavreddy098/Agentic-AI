export const MCP_REVISION = "2026-07-28";
export const LEGACY_MCP_REVISION = "2025-11-25";

export function assertMcpRevision(revision: unknown): asserts revision is typeof MCP_REVISION {
  if (revision !== MCP_REVISION) throw new Error("MCP_PROTOCOL_VERSION: unsupported revision");
}
