import { createHash, createPrivateKey, createPublicKey, sign, verify } from "crypto";
import { SkillManifestSchema, type SkillManifest } from "@asi/contracts";

export interface VerifySkillConfig {
  trustedKeys: Map<string, Buffer>;
}

export interface VerifySkillInput {
  manifest: SkillManifest;
}

export interface VerifySkillResult {
  valid: boolean;
  publisherId: string;
  skillVersionId: string;
  canonicalBytes: Buffer;
  manifestHash: string;
}

export function canonicalizeManifest(manifest: SkillManifest): string {
  // Exclude publisherSignature from canonicalization since it's the value being signed/verified
  const rest = { ...manifest } as Record<string, unknown>;
  delete rest.publisherSignature;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export function canonicalizeForHash(manifest: SkillManifest): string {
  // Exclude both publisherSignature and artifactHash for artifact hash computation
  const rest = { ...manifest } as Record<string, unknown>;
  delete rest.publisherSignature;
  delete rest.artifactHash;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export function computeManifestHash(manifest: SkillManifest): string {
  const canonical = canonicalizeForHash(manifest);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function signManifest(manifest: SkillManifest, privateKey: string | Buffer): Buffer {
  const canonical = canonicalizeForHash(manifest);
  const data = Buffer.from("ASI-SKILL-MANIFEST-v1\n" + canonical, "utf8");
  const key = typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  return sign(null, data, key);
}

export function verifyManifest(manifest: SkillManifest, publicKey: string | Buffer): boolean {
  const canonical = canonicalizeForHash(manifest);
  const data = Buffer.from("ASI-SKILL-MANIFEST-v1\n" + canonical, "utf8");
  const key = typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
  const signature = Buffer.from(manifest.publisherSignature, "hex");
  return verify(null, data, key, signature);
}

export function validateManifestStructure(manifest: unknown): SkillManifest {
  return SkillManifestSchema.parse(manifest);
}

export function createSkillVersionId(publisherId: string, skillId: string, skillVersion: string): string {
  const input = `${publisherId}:${skillId}:${skillVersion}`;
  return createHash("sha256").update(input).digest("hex").substring(0, 32);
}