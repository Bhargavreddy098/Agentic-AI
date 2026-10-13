import { z } from "zod";
import { OpaqueIdSchema } from "@asi/contracts";
import type { Principal } from "@asi/contracts";

export const GrantSchema = z.strictObject({
  grantId: OpaqueIdSchema,
  subjectId: OpaqueIdSchema,
  roles: z.array(OpaqueIdSchema).min(1).max(64),
  agentId: OpaqueIdSchema.optional(),
  parentGrantId: OpaqueIdSchema.optional(),
  capabilities: z.array(OpaqueIdSchema).min(1).max(128),
  audience: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  revokedAt: z.number().int().positive().optional(),
  revokedReason: z.string().max(1024).optional(),
}).refine(grant => grant.expiresAt > grant.issuedAt, "Grant expiry must follow issuance");

export type Grant = z.infer<typeof GrantSchema>;

export interface GrantStore {
  get(grantId: string): Promise<Grant | null>;
  set(grant: Grant): Promise<void>;
  delete(grantId: string): Promise<boolean>;
  listByTenant?(tenantId: string): Promise<Grant[]>;
}

export function grantClaims(grant: Grant): Omit<Grant, "revokedAt" | "revokedReason"> {
  const claims = { ...GrantSchema.parse(grant) };
  delete claims.revokedAt;
  delete claims.revokedReason;
  return claims;
}

export function sameGrantClaims(left: Grant, right: Grant): boolean {
  return JSON.stringify(grantClaims(left)) === JSON.stringify(grantClaims(right));
}

class MemoryGrantStore implements GrantStore {
  private store = new Map<string, Grant>();
  private deleted = new Set<string>();

  async get(grantId: string): Promise<Grant | null> {
    return structuredClone(this.store.get(grantId) ?? null);
  }

  async set(grant: Grant): Promise<void> {
    const parsed = GrantSchema.parse(grant);
    if (!this.store.has(parsed.grantId) && parsed.parentGrantId) {
      const parent = await requireActiveGrant(parsed.parentGrantId, this, 16);
      if (parent.tenantId !== parsed.tenantId || parsed.expiresAt > parent.expiresAt || parsed.capabilities.some(cap => !parent.capabilities.includes(cap))) throw new Error("Invalid delegated grant scope");
    }
    // An ancestry read yields; compare against current state before the atomic write.
    const existing = this.store.get(parsed.grantId);
    if (this.deleted.has(parsed.grantId)) throw new Error("Deleted grant ID cannot be reused");
    if (existing && !sameGrantClaims(existing, parsed)) throw new Error("Immutable grant claims conflict");
    this.store.set(parsed.grantId, structuredClone(existing?.revokedAt !== undefined ? existing : parsed));
  }

  async delete(grantId: string): Promise<boolean> {
    if (!this.store.delete(grantId)) return false;
    this.deleted.add(grantId);
    return true;
  }

  async listByTenant(tenantId: string): Promise<Grant[]> {
    return structuredClone(Array.from(this.store.values()).filter((g) => g.tenantId === tenantId));
  }
}

const unavailableStore: GrantStore = {
  get: async () => { throw new Error("Authorization store not configured"); },
  set: async () => { throw new Error("Authorization store not configured"); },
  delete: async () => { throw new Error("Authorization store not configured"); },
};
let grantStore: GrantStore = unavailableStore;
let principalBindings = new WeakMap<Principal, { grant: Grant; store: GrantStore }>();

/** Explicit fixture store; never selected as a production fallback. */
export function createMemoryGrantStore(): GrantStore {
  return new MemoryGrantStore();
}

export function getGrantStore(): GrantStore {
  return grantStore;
}

export function setGrantStore(store: GrantStore): void {
  grantStore = store;
  principalBindings = new WeakMap();
}

export function resetGrantStore(): void {
  setGrantStore(unavailableStore);
}

export function bindPrincipal(principal: Principal, grant: Grant): void {
  principalBindings.set(principal, { grant: structuredClone(grant), store: grantStore });
}

export async function authenticatedParentGrant(parent: Principal): Promise<Grant> {
  const binding = principalBindings.get(parent);
  if (!binding || binding.store !== grantStore) throw new Error("Parent must be an authenticated issued or verified principal");
  const live = await requireActiveGrant(binding.grant.grantId, grantStore, 16);
  if (!sameGrantClaims(binding.grant, live) || parent.tenantId !== live.tenantId || parent.subjectId !== live.subjectId || parent.agentId !== live.agentId || parent.audience !== live.audience || JSON.stringify(parent.roles) !== JSON.stringify(live.roles) || JSON.stringify(parent.capabilities) !== JSON.stringify(live.capabilities) || Math.floor(Date.parse(parent.expiresAt) / 1000) !== live.expiresAt || parent.authenticatedSource !== "asi-identity") throw new Error("Authenticated parent was changed");
  return live;
}

export async function requireActiveGrant(grantId: string, store: GrantStore = grantStore, maxNodes = 17): Promise<Grant> {
  const seen = new Set<string>();
  let id: string | undefined = grantId, leaf: Grant | undefined, child: Grant | undefined;
  while (id !== undefined) {
    if (seen.has(id) || seen.size >= maxNodes) throw new Error("Invalid grant ancestry");
    seen.add(id);
    const raw = await store.get(id);
    if (!raw) throw new Error("Unknown authorization grant");
    const grant = GrantSchema.parse(raw), now = Date.now() / 1000;
    if (grant.grantId !== id || grant.issuedAt > now || grant.expiresAt <= now) throw new Error("Grant expired or not yet valid");
    if (grant.revokedAt !== undefined) throw new Error("Token revoked");
    if (child && (child.tenantId !== grant.tenantId || child.expiresAt > grant.expiresAt || child.capabilities.some(cap => !grant.capabilities.includes(cap)))) throw new Error("Invalid delegated grant scope");
    leaf ??= grant;
    child = grant;
    id = grant.parentGrantId;
  }
  return leaf!;
}

export async function revokeGrant(grantId: string, reason?: string): Promise<boolean> {
  const grant = await grantStore.get(grantId);
  if (!grant) return false;
  if (grant.revokedAt) return true;
  const revoked: Grant = {
    ...grant,
    revokedAt: Date.now(),
    revokedReason: reason ?? "revoked",
  };
  await grantStore.set(revoked);
  return true;
}

export async function isGrantRevoked(grantId: string): Promise<boolean> {
  const grant = await grantStore.get(grantId);
  if (!grant) throw new Error("Unknown authorization grant");
  return grant.revokedAt !== undefined;
}
