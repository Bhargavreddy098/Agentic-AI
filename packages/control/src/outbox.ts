import type { Pool,PoolClient } from "pg";
import { TaskEnvelopeSchema,EffectRequestSchema,DeliveryRecordSchema,ApprovalRecordSchema,SessionEventSchema,OpaqueIdSchema } from "@asi/contracts";
import type { TaskEnvelope,EffectRequest } from "@asi/contracts";
import { bindScope,transaction,checkContext,fence,boundedLimit } from "./runtime.js";
import type { ControlScope } from "./runtime.js";
import { ingressHash } from "./ingress.js";
export interface OutboxRepository {
 publishTask(runId:string,task:TaskEnvelope,idempotencyKey:string):Promise<void>;
 publishEffect(runId:string,effect:EffectRequest,idempotencyKey:string):Promise<void>;
 publishDelivery(runId:string,payload:unknown,idempotencyKey:string):Promise<void>;
 publishApproval(runId:string,payload:unknown,idempotencyKey:string):Promise<void>;
 publishIngressProjection(payload:unknown,idempotencyKey:string):Promise<void>;
 getPending(limit:number):Promise<Array<{outboxId:string;payloadType:string;payloadJson:unknown;attempts:number;idempotencyKey:string}>>;
 markPublished(outboxId:string):Promise<void>;
 markFailed(outboxId:string,error:string):Promise<void>;
}
export function createOutboxRepository(pool:Pool,input?:ControlScope):OutboxRepository {
 const scope=bindScope(input);
 async function insert(client:PoolClient,runId:string|null,type:string,payload:unknown,key:string,epoch:number|null) {
  const json=JSON.stringify(payload),id=OpaqueIdSchema.parse(key);
  const added=await client.query("INSERT INTO outbox(tenant_id,run_id,payload_type,payload_json,idempotency_key,writer_epoch) VALUES ($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING outbox_id", [scope.tenantId,runId,type,json,id,epoch]);
  if(added.rows.length===0) {
   const same=await client.query("SELECT outbox_id FROM outbox WHERE tenant_id=$1 AND idempotency_key=$2 AND run_id IS NOT DISTINCT FROM $3 AND payload_type=$4 AND payload_json=$5::jsonb AND writer_epoch IS NOT DISTINCT FROM $6::bigint", [scope.tenantId,id,runId,type,json,epoch]);
   if(same.rows.length!==1) throw new Error("Immutable dispatch conflict");
  }
 }
 return {
  publishTask:(id,payload,key)=>transaction(pool,scope,async client=>{
   const parsed=TaskEnvelopeSchema.parse(payload); if(id!==parsed.runContext.runId) throw new Error("Task run mismatch");
   await checkContext(client,scope,parsed.runContext); await insert(client,id,"task",parsed,key,parsed.runContext.writerEpoch);
  }),
  publishEffect:(id,payload,key)=>transaction(pool,scope,async client=>{
   const parsed=EffectRequestSchema.parse(payload); if(id!==parsed.runContext.runId) throw new Error("Effect run mismatch");
   await checkContext(client,scope,parsed.runContext); await insert(client,id,"effect",parsed,key,parsed.runContext.writerEpoch);
  }),
  publishDelivery:(id,payload,key)=>transaction(pool,scope,async client=>{
   const parsed=DeliveryRecordSchema.parse(payload); if(parsed.runId!==id || parsed.status!=="pending") throw new Error("Delivery run or state mismatch");
   const run=await fence(client,scope,id); if(run.session_id!==parsed.sessionId) throw new Error("Delivery session mismatch");
   await insert(client,id,"delivery",parsed,key,Number(run.writer_epoch));
  }),
  publishApproval:(id,payload,key)=>transaction(pool,scope,async client=>{
   const parsed=ApprovalRecordSchema.parse(payload); if(parsed.approver.tenantId!==scope.tenantId) throw new Error("Approval tenant mismatch");
   const run=await fence(client,scope,id);
   const bound=await client.query("SELECT effect_id FROM effect_journal WHERE effect_id=$1 AND run_id=$2 AND tenant_id=$3 AND input_hash=$4", [parsed.effectId,id,scope.tenantId,Buffer.from(parsed.inputHash,"hex")]);
   if(bound.rows.length!==1) throw new Error("Approval does not match an effect intent");
   await insert(client,id,"approval",parsed,key,Number(run.writer_epoch));
  }),
  publishIngressProjection:(payload,key)=>transaction(pool,scope,async client=>{
   const parsed=SessionEventSchema.parse(payload); if(parsed.tenantId!==scope.tenantId) throw new Error("Projection tenant mismatch");
   const found=await client.query("SELECT ingress_id FROM ingress_events WHERE tenant_id=$1 AND platform=$2 AND external_message_id=$3 AND content_hash=$4", [scope.tenantId,parsed.platform,parsed.externalMessageId??parsed.eventId,ingressHash(parsed)]);
   if(found.rows.length!==1 || key!=="ingress:"+found.rows[0].ingress_id) throw new Error("Projection lacks canonical ingress binding");
   await insert(client,null,"ingress_projection",parsed,key,null);
  }),
  getPending:limit=>transaction(pool,scope,async client=>{
   const result=await client.query("SELECT o.* FROM outbox o WHERE o.tenant_id=$1 AND o.status='pending' AND o.attempts<o.max_attempts AND o.scheduled_at<=clock_timestamp() AND (o.run_id IS NULL OR EXISTS (SELECT 1 FROM runs r JOIN sessions s ON s.session_id=r.session_id JOIN writer_leases l ON l.run_id=r.run_id AND l.session_id=r.session_id WHERE r.run_id=o.run_id AND r.tenant_id=o.tenant_id AND r.writer_epoch=o.writer_epoch AND l.writer_epoch=o.writer_epoch AND l.expires_at>clock_timestamp() AND r.deadline_at>clock_timestamp() AND s.status='active' AND r.status IN ('running','waiting_approval'))) ORDER BY o.created_at LIMIT $2", [scope.tenantId,boundedLimit(limit)]);
   return result.rows.map(row=>({outboxId:row.outbox_id,payloadType:row.payload_type,payloadJson:row.payload_json,attempts:row.attempts,idempotencyKey:row.idempotency_key}));
  }),
  markPublished:id=>transaction(pool,scope,async client=>{
   const result=await client.query("UPDATE outbox SET status='published',published_at=clock_timestamp() WHERE outbox_id=$1 AND tenant_id=$2 AND status='pending' AND attempts<max_attempts AND scheduled_at<=clock_timestamp() RETURNING outbox_id", [OpaqueIdSchema.parse(id),scope.tenantId]);
   if(result.rows.length!==1) throw new Error("Dispatch is not publishable");
  }),
  markFailed:(id,_error)=>transaction(pool,scope,async client=>{
   void _error; // Raw transport errors can contain credentials; store a fixed category.
   const result=await client.query("UPDATE outbox SET attempts=attempts+1,status=CASE WHEN attempts+1>=max_attempts THEN 'dead_letter' ELSE 'pending' END,last_error='transport failure',scheduled_at=clock_timestamp()+least(interval '60seconds',interval '1second'*power(2,attempts)) WHERE outbox_id=$1 AND tenant_id=$2 AND status='pending' AND attempts<max_attempts AND scheduled_at<=clock_timestamp() RETURNING outbox_id", [OpaqueIdSchema.parse(id),scope.tenantId]);
   if(result.rows.length!==1) throw new Error("Dispatch retry is inactive, delayed or exhausted");
  })
 };
}
export type { OutboxRepository as OutboxPort };

