import type { Principal } from "@asi/contracts";
import { PrincipalSchema } from "@asi/contracts";
import { signToken, type TokenPayload } from "./token.js";
import { getGrantStore, GrantSchema, authenticatedParentGrant, bindPrincipal } from "./revoke.js";
import { getPrimaryKey } from "./config.js";
import { randomBytes } from "node:crypto";

function fromOpaqueId(value: string): string {
  return value;
}

function fromFutureTimestamp(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

function toOpaqueId(value: string): string {
  return value;
}

export async function createPrincipalToken(principal: Principal): Promise<string> {
  return issuePrincipal(principal);
}

async function issuePrincipal(principal: Principal, parentGrantId?: string): Promise<string> {
  const parsed = PrincipalSchema.parse(principal);
  const now = Math.floor(Date.now() / 1000);
  const key = getPrimaryKey();
  if (key.expiresAt !== undefined && Date.parse(parsed.expiresAt) > key.expiresAt) throw new Error("Token cannot outlive its signing key");
  const payload: TokenPayload = {
    iss: "asi-identity",
    sub: fromOpaqueId(parsed.subjectId),
    aud: fromOpaqueId(parsed.audience),
    iat: now,
    exp: fromFutureTimestamp(parsed.expiresAt),
    nbf: now,
    jti: `grant-${randomBytes(16).toString("base64url")}`,
    capabilities: parsed.capabilities.map(fromOpaqueId),
    tenantId: parsed.tenantId,
    roles: parsed.roles,
    ...(parsed.agentId !== undefined ? { agentId: parsed.agentId } : {}),
    ...(parentGrantId !== undefined ? { parentGrantId } : {}),
  };
  const token = signToken(payload);
  const grant = GrantSchema.parse({
    grantId: payload.jti,
    subjectId: payload.sub,
    roles: payload.roles,
    ...(payload.agentId !== undefined ? { agentId: payload.agentId } : {}),
    ...(parentGrantId !== undefined ? { parentGrantId } : {}),
    capabilities: payload.capabilities,
    audience: payload.aud,
    tenantId: payload.tenantId,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  });
  await getGrantStore().set(grant);
  bindPrincipal(principal, grant);
  return token;
}

export async function delegatePrincipal(
  parent: Principal,
  capabilities: string[],
  audience: string,
  expiresAt: string
): Promise<string> {
  const parentCaps = new Set(parent.capabilities.map(fromOpaqueId));
  for (const cap of capabilities) {
    if (!parentCaps.has(cap)) {
      throw new Error(`Capability ${cap} not permitted for delegation`);
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const expSec = fromFutureTimestamp(expiresAt);
  if (expSec <= now) throw new Error("Expiry must be in the future");
  const parentExpSec = fromFutureTimestamp(parent.expiresAt);
  if (expSec > parentExpSec) throw new Error("Delegate expiry cannot exceed parent expiry");
  const parentGrant = await authenticatedParentGrant(parent);
  const child: Principal = {
    tenantId: parent.tenantId,
    subjectId: `delegated-${randomBytes(8).toString("base64url")}`,
    agentId: undefined,
    roles: [toOpaqueId("delegated")],
    capabilities: capabilities.map(toOpaqueId),
    audience: toOpaqueId(audience),
    expiresAt,
    authenticatedSource: toOpaqueId("asi-identity"),
  };
  return issuePrincipal(child, parentGrant.grantId);
}
