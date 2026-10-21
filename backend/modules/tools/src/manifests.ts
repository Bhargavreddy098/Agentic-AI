import { createHash, createPublicKey, verify } from "node:crypto";
import { types } from "node:util";
import { ToolManifestSchema, type ToolManifest } from "@asi/contracts";

const MAX_BYTES = 65_536;
const MAX_DEPTH = 32;
const MAX_NODES = 8_192;
const DOMAIN = "ASI-TOOL-MANIFEST-v1\n";

/** Bounded, lossless JSON with lexical UTF16 ordering, including numeric-looking keys. */
function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  const emit = (token: string): string => {
    bytes += Buffer.byteLength(token, "utf8");
    if (bytes > MAX_BYTES) throw new Error("Manifest exceeds byte limit");
    return token;
  };
  const visit = (entry: unknown, depth: number): string => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error("Manifest exceeds structural limit");
    if (entry === null || typeof entry === "boolean") return emit(JSON.stringify(entry));
    if (typeof entry === "string") {
      if (entry.length > MAX_BYTES) throw new Error("Manifest exceeds byte limit");
      return emit(JSON.stringify(entry));
    }
    if (typeof entry === "number" && Number.isFinite(entry) && !Object.is(entry, -0) &&
      (!Number.isInteger(entry) || Number.isSafeInteger(entry))) return emit(JSON.stringify(entry));
    if (typeof entry !== "object" || types.isProxy(entry) || ancestors.has(entry)) throw new Error("Lossless JSON required");
    const array = Array.isArray(entry);
    if (!array && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) {
      throw new Error("Plain JSON data required");
    }
    const keys = Reflect.ownKeys(entry);
    if (keys.length > MAX_NODES) throw new Error("Manifest exceeds structural limit");
    if (array && (entry.length > MAX_NODES || keys.length !== entry.length + 1)) throw new Error("Dense JSON array required");
    const data = new Map<string, unknown>();
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string") throw new Error("JSON keys must be strings");
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error("JSON accessors are forbidden");
      data.set(key, descriptor.value);
    }
    ancestors.add(entry);
    let encoded: string;
    if (array) {
      const items: string[] = [];
      const open = emit("[");
      for (let index = 0; index < entry.length; index++) {
        if (!data.has(String(index))) throw new Error("Dense JSON array required");
        if (index) emit(",");
        items.push(visit(data.get(String(index)), depth + 1));
      }
      encoded = open + items.join(",") + emit("]");
    } else {
      const open = emit("{");
      const items: string[] = [];
      for (const key of [...data.keys()].sort()) {
        if (items.length) emit(",");
        if (key.length > MAX_BYTES) throw new Error("Manifest exceeds byte limit");
        items.push(emit(JSON.stringify(key) + ":") + visit(data.get(key), depth + 1));
      }
      encoded = open + items.join(",") + emit("}");
    }
    ancestors.delete(entry);
    return encoded;
  };
  return visit(value, 0);
}

export const ManifestValidationSchema: typeof ToolManifestSchema = ToolManifestSchema.refine(
  value => /^[a-f0-9]{128}$/.test(value.publisherSignature),
  "Ed25519 signature must be 128 lowercase hexadecimal characters",
);
export type ValidatedToolManifest = ToolManifest;

export interface ManifestValidationResult {
  valid: boolean;
  manifest?: ValidatedToolManifest;
  errors: string[];
}

export function validateManifest(manifest: unknown): ManifestValidationResult {
  try {
    // Inspect descriptors before Zod reads fields; getters and toJSON must never execute.
    const snapshot: unknown = JSON.parse(canonicalJson(manifest));
    const result = ManifestValidationSchema.safeParse(snapshot);
    if (!result.success) return { valid: false, errors: result.error.issues.map(e => e.path.join(".") + ": " + e.message) };
    // Zod record parsing may omit __proto__; validation must not transform the signed data.
    return { valid: true, manifest: snapshot as ToolManifest, errors: [] };
  } catch {
    return { valid: false, errors: ["Manifest must contain bounded lossless JSON data"] };
  }
}

export function getManifestSigningBytes(manifest: unknown): Buffer {
  const validation = validateManifest(manifest);
  if (!validation.valid || !validation.manifest) throw new Error("Invalid manifest");
  const body: Record<string, unknown> = { ...validation.manifest };
  delete body.publisherSignature;
  return Buffer.from(DOMAIN + canonicalJson(body), "utf8");
}

export function verifyManifestSignature(manifest: ValidatedToolManifest, publicKey: string): boolean {
  try {
    const signingBytes = getManifestSigningBytes(manifest);
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== "ed25519") return false;
    return verify(null, signingBytes, key, Buffer.from(manifest.publisherSignature, "hex"));
  } catch {
    return false;
  }
}

/** Digest exact executable bytes; metadata is never a substitute for the artifact. */
export function computeArtifactDigest(artifactBytes: Uint8Array): string {
  return createHash("sha256").update(artifactBytes).digest("hex");
}

export function checkManifestDigest(manifest: ValidatedToolManifest, artifactBytes?: Uint8Array): boolean {
  if (!artifactBytes || !validateManifest(manifest).valid) return false;
  return manifest.artifactDigest === computeArtifactDigest(artifactBytes);
}
