import { GrantSchema, grantClaims, requireActiveGrant } from "./revoke.js";
import type { Grant, GrantStore } from "./revoke.js";
import { OpaqueIdSchema } from "@asi/contracts";

/** Inject a trusted service connection, never a connection supplied by a task. */
export interface GrantQueryClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export class PostgresGrantStore implements GrantStore {
  constructor(private readonly client: GrantQueryClient) {}

  private async query(sql: string, parameters: unknown[]) {
    try { return await this.client.query(sql, parameters); }
    catch { throw new Error("Durable authorization store unavailable or write denied"); }
  }

  private decode(row: Record<string, unknown>): Grant {
    const revokedAt = row.revoked_at === null ? undefined : Number(row.revoked_at);
    if (revokedAt !== undefined && !Number.isSafeInteger(revokedAt)) throw new Error("Invalid durable revocation state");
    const claims = row.claims;
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error("Invalid durable authorization claims");
    const grant = GrantSchema.parse({ ...claims, ...(revokedAt !== undefined ? { revokedAt, revokedReason: row.revoked_reason ?? "revoked" } : {}) });
    if (grant.grantId !== row.grant_id || grant.tenantId !== row.tenant_id || (grant.parentGrantId ?? null) !== row.parent_grant_id) throw new Error("Durable grant identity mismatch");
    return grant;
  }

  async get(grantId: string): Promise<Grant | null> {
    const result = await this.query("SELECT grant_id, tenant_id, parent_grant_id, claims, revoked_at, revoked_reason FROM identity_grants WHERE grant_id = $1 AND NOT deleted", [OpaqueIdSchema.parse(grantId)]);
    return result.rows[0] ? this.decode(result.rows[0]) : null;
  }

  async set(input: Grant): Promise<void> {
    const grant = GrantSchema.parse(input), claims = grantClaims(grant);
    if (grant.parentGrantId && !(await this.get(grant.grantId))) await requireActiveGrant(grant.parentGrantId, this, 16);
    const result = await this.query(`
      INSERT INTO identity_grants(grant_id, tenant_id, parent_grant_id, claims, revoked_at, revoked_reason)
      SELECT $1, $2, $3, $4::jsonb, $5::bigint, $6
      WHERE EXISTS (SELECT 1 FROM identity_grants WHERE grant_id = $1)
        OR ($3::text IS NULL AND ($4::jsonb->>'expiresAt')::bigint > extract(epoch FROM clock_timestamp()))
        OR EXISTS (
          SELECT 1 FROM identity_grants parent
          WHERE parent.grant_id = $3 AND parent.tenant_id = $2 AND parent.revoked_at IS NULL AND NOT parent.deleted
            AND (parent.claims->>'expiresAt')::bigint > extract(epoch FROM clock_timestamp())
            AND ($4::jsonb->>'expiresAt')::bigint <= (parent.claims->>'expiresAt')::bigint
            AND ($4::jsonb->'capabilities') <@ (parent.claims->'capabilities')
        )
      ON CONFLICT (grant_id) DO UPDATE SET
        revoked_at = coalesce(identity_grants.revoked_at, EXCLUDED.revoked_at),
        revoked_reason = CASE WHEN identity_grants.revoked_at IS NOT NULL THEN identity_grants.revoked_reason ELSE EXCLUDED.revoked_reason END
      WHERE NOT identity_grants.deleted AND identity_grants.claims = EXCLUDED.claims
        AND identity_grants.tenant_id = EXCLUDED.tenant_id
        AND identity_grants.parent_grant_id IS NOT DISTINCT FROM EXCLUDED.parent_grant_id
      RETURNING grant_id`, [grant.grantId, grant.tenantId, grant.parentGrantId ?? null, JSON.stringify(claims), grant.revokedAt ?? null, grant.revokedReason ?? null]);
    if (result.rows.length !== 1) throw new Error("Immutable grant conflict or invalid parent scope");
  }

  async delete(grantId: string): Promise<boolean> {
    const result = await this.query("UPDATE identity_grants SET deleted = TRUE WHERE grant_id = $1 AND NOT deleted RETURNING grant_id", [OpaqueIdSchema.parse(grantId)]);
    return result.rows.length === 1;
  }

  async listByTenant(tenantId: string): Promise<Grant[]> {
    const result = await this.query("SELECT grant_id, tenant_id, parent_grant_id, claims, revoked_at, revoked_reason FROM identity_grants WHERE tenant_id = $1 AND NOT deleted ORDER BY grant_id", [OpaqueIdSchema.parse(tenantId)]);
    return result.rows.map(row => this.decode(row));
  }
}
