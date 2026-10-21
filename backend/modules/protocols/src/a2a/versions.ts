export const A2A_REVISION = "1.0.0";

export function assertA2aRevision(revision: unknown): asserts revision is typeof A2A_REVISION {
  if (revision !== A2A_REVISION) throw new Error("A2A_PROTOCOL_VERSION: unsupported revision");
}