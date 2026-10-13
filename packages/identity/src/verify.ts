import type { Principal } from "@asi/contracts";
import { PrincipalSchema, OpaqueIdSchema } from "@asi/contracts";
import { verifyTokenSignature, decodeToken } from "./token.js";
import { requireActiveGrant, bindPrincipal } from "./revoke.js";

function toOpaqueId(value: string): string {
  return OpaqueIdSchema.parse(value);
}

function toFutureTimestamp(ms: number): string {
  const date = new Date(ms);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function verifyPrincipal(token: string, audience: string): Promise<Principal> {
  const verified = verifyTokenSignature(token);
  if (!verified) {
    throw new Error("Invalid token signature");
  }
  const { payload } = verified;
  if (payload.aud !== audience) {
    throw new Error(`Token audience mismatch: expected ${audience}, got ${payload.aud}`);
  }
  const now = Date.now();
  if (payload.exp * 1000 <= now) {
    throw new Error("Token expired");
  }
  if (payload.iat * 1000 > now || (payload.nbf && payload.nbf * 1000 > now)) {
    throw new Error("Token not yet valid");
  }
  const grant = await requireActiveGrant(payload.jti);
  if (grant.tenantId !== payload.tenantId || grant.subjectId !== payload.sub || grant.agentId !== payload.agentId || grant.parentGrantId !== payload.parentGrantId || grant.audience !== payload.aud || grant.issuedAt !== payload.iat || grant.expiresAt !== payload.exp || JSON.stringify(grant.roles) !== JSON.stringify(payload.roles) || JSON.stringify(grant.capabilities) !== JSON.stringify(payload.capabilities)) throw new Error("Token does not match authenticated grant");
  const principal: Principal = {
    tenantId: toOpaqueId(payload.tenantId),
    subjectId: toOpaqueId(payload.sub),
    ...(payload.agentId !== undefined ? { agentId: payload.agentId } : {}),
    roles: payload.roles,
    capabilities: payload.capabilities.map(toOpaqueId),
    audience: toOpaqueId(payload.aud),
    expiresAt: toFutureTimestamp(payload.exp * 1000),
    authenticatedSource: toOpaqueId("asi-identity"),
  };
  const parsed = PrincipalSchema.parse(principal);
  bindPrincipal(parsed, grant);
  return parsed;
}

export function parseGrantId(token: string): string {
  const decoded = decodeToken(token);
  if (!decoded) throw new Error("Invalid token format");
  return decoded.payload.jti;
}
