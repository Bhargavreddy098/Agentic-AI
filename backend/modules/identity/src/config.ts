import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SigningKeySchema = z.object({
  kid: z.string().min(1),
  alg: z.literal("HS256"),
  secret: z.string().min(32),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive().optional(),
});

export type SigningKey = z.infer<typeof SigningKeySchema>;

export const SigningConfigSchema = z.object({
  keys: z.array(SigningKeySchema).min(1),
  defaultKid: z.string().min(1),
});

export type SigningConfig = z.infer<typeof SigningConfigSchema>;

let config: SigningConfig | null = null;

export function configureIdentity(cfg: SigningConfig): void {
  const parsed = SigningConfigSchema.parse(cfg);
  if (!parsed.keys.some((k) => k.kid === parsed.defaultKid)) {
    throw new Error(`Default kid ${parsed.defaultKid} not found in keys`);
  }
  if (new Set(parsed.keys.map(key => key.kid)).size !== parsed.keys.length) throw new Error("Duplicate signing key ID");
  if (parsed.keys.some(key => key.expiresAt !== undefined && key.expiresAt <= key.createdAt)) throw new Error("Signing key expiry must follow creation");
  config = parsed;
}

export function resetIdentity(): void {
  config = null;
}

export function getConfig(): SigningConfig | null {
  return config ? structuredClone(config) : null;
}

function assertConfig(): SigningConfig {
  if (!config) throw new Error("Identity not configured");
  return config;
}

export function getPrimaryKey(): SigningKey {
  const cfg = assertConfig();
  const key = cfg.keys.find((k) => k.kid === cfg.defaultKid);
  if (!key) throw new Error(`Primary key ${cfg.defaultKid} not found`);
  assertKeyValid(key);
  return structuredClone(key);
}

export function getVerificationKey(kid: string): SigningKey {
  const cfg = assertConfig();
  const key = cfg.keys.find((k) => k.kid === kid);
  if (!key) throw new Error(`Key ${kid} not found`);
  assertKeyValid(key);
  return structuredClone(key);
}

function assertKeyValid(key: SigningKey): void {
  const now = Date.now();
  if (key.createdAt > now || (key.expiresAt !== undefined && key.expiresAt <= now)) throw new Error("Signing key is not currently valid");
}

export function generateSigningKey(kid: string, ttlMs?: number): SigningKey {
  const now = Date.now();
  const key: SigningKey = {
    kid,
    alg: "HS256",
    secret: randomBytes(32).toString("base64url"),
    createdAt: now,
  };
  if (ttlMs) key.expiresAt = now + ttlMs;
  return key;
}

function hmacSha256(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signPayload(secret: string, payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = hmacSha256(secret, encoded);
  return `${encoded}.${signature}`;
}

export function verifyPayload(secret: string, token: string): object | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const encoded = parts[0];
  const signature = parts[1];
  if (encoded === undefined || signature === undefined) return null;
  const expected = hmacSha256(secret, encoded);
  let expectedBuf: Buffer, signatureBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected);
    signatureBuf = Buffer.from(signature);
  } catch {
    return null;
  }
  if (expectedBuf.length !== signatureBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, signatureBuf)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    return null;
  }
}
