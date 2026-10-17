import type { Pool } from "pg";
import type { WriterLease } from "@asi/contracts";
import { WriterLeaseSchema, OpaqueIdSchema } from "@asi/contracts";
import { bindScope, transaction, safeInteger, fence, lockWriter } from "./runtime.js";
import type { ControlScope } from "./runtime.js";

export interface LeaseRepository {
  claimSession(sessionId: string, runId: string): Promise<WriterLease>;
  renewLease(lease: WriterLease): Promise<WriterLease>;
  getLease(sessionId: string): Promise<WriterLease | null>;
  releaseLease(sessionId: string, runId: string, epoch: number): Promise<boolean>;
}
function decode(row: Record<string, unknown>): WriterLease {
  return WriterLeaseSchema.parse({ sessionId: row.session_id, runId: row.run_id, writerEpoch: safeInteger(row.writer_epoch, 1), expiresAt: (row.expires_at as Date).toISOString() });
}
export function createLeaseRepository(pool: Pool, input?: ControlScope): LeaseRepository {
  const scope = bindScope(input);
  return {
    claimSession: (sessionId, runId) => transaction(pool, scope, async client => {
      OpaqueIdSchema.parse(sessionId); OpaqueIdSchema.parse(runId);
      const session = await client.query("SELECT * FROM sessions WHERE session_id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE", [sessionId, scope.tenantId]);
      if (session.rows.length !== 1) throw new Error("Active session not found");
      const run = await client.query("SELECT * FROM runs WHERE run_id=$1 AND session_id=$2 AND tenant_id=$3 AND status IN ('accepted','queued','running','waiting_approval') AND deadline_at>clock_timestamp() FOR UPDATE", [runId, sessionId, scope.tenantId]);
      if (run.rows.length !== 1) throw new Error("Claimable run not found");
      const current = await client.query("SELECT *,expires_at>clock_timestamp() AS live FROM writer_leases WHERE session_id=$1 FOR UPDATE", [sessionId]);
      const eligible = await client.query("SELECT l.expires_at>clock_timestamp() AS live FROM runs r JOIN sessions s ON s.session_id=r.session_id AND s.tenant_id=r.tenant_id LEFT JOIN writer_leases l ON l.session_id=r.session_id WHERE r.run_id=$1 AND r.session_id=$2 AND r.tenant_id=$3 AND s.status='active' AND r.status IN ('accepted','queued','running','waiting_approval') AND r.deadline_at>clock_timestamp()", [runId, sessionId, scope.tenantId]);
      if (eligible.rows.length !== 1) throw new Error("Claimable run not found after lock wait");
      const lease = current.rows[0];
      if (lease && eligible.rows[0].live === true) {
        if (lease.owner_id !== scope.ownerId || lease.run_id !== runId || safeInteger(lease.writer_epoch, 1) !== safeInteger(run.rows[0].writer_epoch, 1)) throw new Error("Session already has a live owner");
        return decode(lease);
      }
      const newEpoch = safeInteger(session.rows[0].writer_epoch) + 1;
      safeInteger(newEpoch, 1);
      await client.query("UPDATE sessions SET writer_epoch=$1,updated_at=clock_timestamp() WHERE session_id=$2", [newEpoch, sessionId]);
      await client.query("UPDATE runs SET writer_epoch=$1,status='running',started_at=coalesce(started_at,clock_timestamp()) WHERE run_id=$2", [newEpoch, runId]);
      const written = await client.query("INSERT INTO writer_leases(session_id,run_id,tenant_id,owner_id,writer_epoch,expires_at) VALUES ($1,$2,$3,$4,$5,least(clock_timestamp()+interval '30 seconds',$6::timestamptz)) ON CONFLICT(session_id) DO UPDATE SET run_id=EXCLUDED.run_id,tenant_id=EXCLUDED.tenant_id,owner_id=EXCLUDED.owner_id,writer_epoch=EXCLUDED.writer_epoch,expires_at=EXCLUDED.expires_at,acquired_at=clock_timestamp(),renewed_at=clock_timestamp() RETURNING *", [sessionId, runId, scope.tenantId, scope.ownerId, newEpoch, run.rows[0].deadline_at]);
      return decode(written.rows[0]);
    }),
    renewLease: lease => transaction(pool, scope, async client => {
      const parsed = WriterLeaseSchema.parse(lease);
      await fence(client, scope, parsed.runId, parsed.writerEpoch);
      const result = await client.query("UPDATE writer_leases l SET expires_at=least(clock_timestamp()+interval '30 seconds',r.deadline_at),renewed_at=clock_timestamp() FROM runs r,sessions s WHERE l.session_id=$1 AND l.run_id=$2 AND l.writer_epoch=$3 AND l.owner_id=$4 AND l.tenant_id=$5 AND r.run_id=l.run_id AND r.writer_epoch=l.writer_epoch AND s.session_id=l.session_id AND s.status='active' AND r.status IN ('running','waiting_approval') AND l.expires_at>clock_timestamp() AND r.deadline_at>clock_timestamp() RETURNING l.*", [parsed.sessionId, parsed.runId, parsed.writerEpoch, scope.ownerId, scope.tenantId]);
      if (result.rows.length !== 1) throw new Error("Lease expired, inactive or owned by another writer");
      return decode(result.rows[0]);
    }),
    getLease: sessionId => transaction(pool, scope, async client => {
      const result = await client.query("SELECT * FROM writer_leases WHERE session_id=$1 AND tenant_id=$2", [OpaqueIdSchema.parse(sessionId), scope.tenantId]);
      return result.rows[0] ? decode(result.rows[0]) : null;
    }),
    releaseLease: (sessionId, runId, epoch) => transaction(pool, scope, async client => {
      OpaqueIdSchema.parse(sessionId);
      const locked = await lockWriter(client, scope, runId, epoch);
      if (!locked || locked.session_id !== sessionId) return false;
      const result = await client.query("DELETE FROM writer_leases l USING runs r,sessions s WHERE l.session_id=$1 AND l.run_id=$2 AND l.writer_epoch=$3 AND l.owner_id=$4 AND l.tenant_id=$5 AND r.run_id=l.run_id AND r.writer_epoch=l.writer_epoch AND s.session_id=l.session_id AND s.status='active' AND r.status IN ('running','waiting_approval') AND l.expires_at>clock_timestamp() AND r.deadline_at>clock_timestamp() RETURNING l.session_id", [OpaqueIdSchema.parse(sessionId), OpaqueIdSchema.parse(runId), safeInteger(epoch, 1), scope.ownerId, scope.tenantId]);
      return result.rows.length === 1;
    })
  };
}
export type { LeaseRepository as LeasePort };

