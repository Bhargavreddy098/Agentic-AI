import { z } from "zod";
import { getPrimaryKey, getVerificationKey } from "./config.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { OpaqueIdSchema } from "@asi/contracts";

export const TokenHeaderSchema = z.strictObject({
  kid: OpaqueIdSchema,
  alg: z.literal("HS256"),
  typ: z.literal("JWT"),
});

export type TokenHeader = z.infer<typeof TokenHeaderSchema>;

export const TokenPayloadSchema = z.strictObject({
  iss: z.literal("asi-identity"),
  sub: OpaqueIdSchema,
  aud: OpaqueIdSchema,
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  nbf: z.number().int().positive().optional(),
  jti: OpaqueIdSchema,
  capabilities: z.array(OpaqueIdSchema).min(1).max(128),
  tenantId: OpaqueIdSchema,
  roles: z.array(OpaqueIdSchema).min(1).max(64),
  agentId: OpaqueIdSchema.optional(),
  parentGrantId: OpaqueIdSchema.optional(),
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString();
}

function hmacSha256Base64Url(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signToken(payload: TokenPayload): string {
  payload = TokenPayloadSchema.parse(payload);
  const key = getPrimaryKey();
  const header: TokenHeader = { kid: key.kid, alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = hmacSha256Base64Url(key.secret, signingInput);
  return `${signingInput}.${signature}`;
}

export function decodeToken(token: string): { header: TokenHeader; payload: TokenPayload } | null {
  if (typeof token !== "string" || token.length > 65536) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const encodedHeader = parts[0];
  const encodedPayload = parts[1];
  if (encodedHeader === undefined || encodedPayload === undefined) return null;
  try {
    const header = TokenHeaderSchema.parse(JSON.parse(base64urlDecode(encodedHeader)));
    const payload = TokenPayloadSchema.parse(JSON.parse(base64urlDecode(encodedPayload)));
    return { header, payload };
  } catch {
    return null;
  }
}

export function verifyTokenSignature(token: string): { header: TokenHeader; payload: TokenPayload } | null {
  if (typeof token !== "string" || token.length > 65536) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const encodedHeader = parts[0];
  const encodedPayload = parts[1];
  const signature = parts[2];
  if (encodedHeader === undefined || encodedPayload === undefined || signature === undefined) return null;
  try {
    const header = TokenHeaderSchema.parse(JSON.parse(base64urlDecode(encodedHeader)));
    const key = getVerificationKey(header.kid);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = hmacSha256Base64Url(key.secret, signingInput);
    const expectedBuf = Buffer.from(expectedSignature);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, signatureBuf)) return null;
    const payload = TokenPayloadSchema.parse(JSON.parse(base64urlDecode(encodedPayload)));
    return { header, payload };
  } catch {
    return null;
  }
}
