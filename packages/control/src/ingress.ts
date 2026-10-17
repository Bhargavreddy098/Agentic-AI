import type { Pool } from "pg";
import type { SessionEvent } from "@asi/contracts";
import { SessionEventSchema, OpaqueIdSchema } from "@asi/contracts";
import { createHash } from "node:crypto";
import { bindScope, transaction, boundedLimit } from "./runtime.js";
import type { ControlScope } from "./runtime.js";
export interface IngressResult { acceptedId: string; duplicate: boolean }
export interface IngressRepository {
 acceptIngress(event: SessionEvent): Promise<IngressResult>;
 getPendingProjection(limit: number): Promise<Array<{ ingressId: string; tenantId: string; contentJson: unknown }>>;
 markProjected(ingressId: string): Promise<void>;
 markProjectionFailed(ingressId: string,error: string): Promise<void>;
}
export function ingressHash(event: SessionEvent): Buffer {
 return createHash("sha256").update(JSON.stringify({ sessionId:event.sessionId, principalId:event.principal.subjectId, roles:event.principal.roles, capabilities:event.principal.capabilities, content:event.content, attachments:event.attachments??[] })).digest();
}
export function createIngressRepository(pool: Pool, input?: ControlScope): IngressRepository {
 const scope=bindScope(input);
 return {
  acceptIngress: event => transaction(pool,scope,async client => {
   const parsed=SessionEventSchema.parse(event);
   if (parsed.tenantId!==scope.tenantId) throw new Error("Authenticated ingress tenant mismatch");
   const hash=ingressHash(parsed), external=parsed.externalMessageId??parsed.eventId;
   const inserted=await client.query("INSERT INTO ingress_events(tenant_id,platform,external_message_id,principal_id,content_hash,content_json,attachment_refs) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT(tenant_id,platform,external_message_id) DO NOTHING RETURNING ingress_id", [scope.tenantId,parsed.platform,external,parsed.principal.subjectId,hash,JSON.stringify(parsed.content),JSON.stringify(parsed.attachments??[])]);
   if (inserted.rows.length===0) {
    const previous=await client.query("SELECT ingress_id FROM ingress_events WHERE tenant_id=$1 AND platform=$2 AND external_message_id=$3 AND content_hash=$4", [scope.tenantId,parsed.platform,external,hash]);
    if(previous.rows.length!==1) throw new Error("Ingress identity reused with different content");
    return {acceptedId:previous.rows[0].ingress_id,duplicate:true};
   }
   const id=inserted.rows[0].ingress_id;
   await client.query("INSERT INTO outbox(tenant_id,run_id,payload_type,payload_json,idempotency_key) VALUES ($1,NULL,'ingress_projection',$2::jsonb,$3)", [scope.tenantId,JSON.stringify(parsed),"ingress:"+id]);
   return {acceptedId:id,duplicate:false};
  }),
  getPendingProjection: limit => transaction(pool,scope,async client => {
   const result=await client.query("SELECT ingress_id,tenant_id,content_json FROM ingress_events WHERE tenant_id=$1 AND projection_status='pending' ORDER BY received_at LIMIT $2", [scope.tenantId,boundedLimit(limit)]);
   return result.rows.map(row=>({ingressId:row.ingress_id,tenantId:row.tenant_id,contentJson:row.content_json}));
  }),
  markProjected: id => transaction(pool,scope,async client=>{ await client.query("UPDATE ingress_events SET projection_status='projected' WHERE ingress_id=$1 AND tenant_id=$2 AND projection_status='pending'", [OpaqueIdSchema.parse(id),scope.tenantId]); }),
  markProjectionFailed: (id,_error) => transaction(pool,scope,async client=>{ void _error; await client.query("UPDATE ingress_events SET projection_status='failed' WHERE ingress_id=$1 AND tenant_id=$2 AND projection_status='pending'", [OpaqueIdSchema.parse(id),scope.tenantId]); })
 };
}
export type { IngressRepository as IngressPort };

