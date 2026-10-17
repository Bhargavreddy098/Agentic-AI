import type { Pool } from "pg";
import type { EffectRequest,NormalizedError } from "@asi/contracts";
import { EffectRequestSchema,NormalizedErrorSchema,EffectStatusSchema,OpaqueIdSchema,boundedJsonObjectSchema } from "@asi/contracts";
import { bindScope,transaction,checkContext,fence,safeInteger } from "./runtime.js";
import type { ControlScope } from "./runtime.js";
export interface EffectRepository {
 recordEffectIntent(request:EffectRequest):Promise<string>;
 getEffect(effectId:string):Promise<EffectRecord|null>;
 authorizeEffect(effectId:string):Promise<void>;
 startEffect(effectId:string):Promise<void>;
 completeEffect(effectId:string,result:unknown):Promise<void>;
 failEffect(effectId:string,error:NormalizedError):Promise<void>;
 markUnknown(effectId:string):Promise<void>;
 reconcileEffect(effectId:string):Promise<{status:string;result?:unknown}>;
}
export interface EffectRecord {
 effectId:string;tenantId:string;runId:string;taskId:string|null;effectType:string;action:string;resource:string;
 inputHash:Buffer;artifactHash:Buffer|null;idempotencyKey:string;status:string;resultJson:unknown|null;
 errorJson:unknown|null;receiptId:string|null;attempts:number;maxAttempts:number;
}
function decode(row:Record<string,unknown>):EffectRecord {
 if(!Buffer.isBuffer(row.input_hash)||row.input_hash.length!==32 || (row.artifact_hash!==null && (!Buffer.isBuffer(row.artifact_hash)||row.artifact_hash.length!==32))) throw new Error("Invalid stored effect digest");
 return { effectId:OpaqueIdSchema.parse(row.effect_id),tenantId:OpaqueIdSchema.parse(row.tenant_id),runId:OpaqueIdSchema.parse(row.run_id),taskId:row.task_id===null?null:OpaqueIdSchema.parse(row.task_id),effectType:OpaqueIdSchema.parse(row.effect_type),action:OpaqueIdSchema.parse(row.action),resource:OpaqueIdSchema.parse(row.resource),inputHash:row.input_hash,artifactHash:row.artifact_hash as Buffer|null,idempotencyKey:OpaqueIdSchema.parse(row.idempotency_key),status:EffectStatusSchema.parse(row.status),resultJson:row.result_json,errorJson:row.error_json,receiptId:row.receipt_id===null?null:OpaqueIdSchema.parse(row.receipt_id),attempts:safeInteger(row.attempts),maxAttempts:safeInteger(row.max_attempts,1) };
}
export function createEffectRepository(pool:Pool,input?:ControlScope):EffectRepository {
 const scope=bindScope(input);
 async function getEffect(id:string):Promise<EffectRecord|null> {
  return transaction(pool,scope,async client=>{
   const result=await client.query("SELECT * FROM effect_journal WHERE effect_id=$1 AND tenant_id=$2", [OpaqueIdSchema.parse(id),scope.tenantId]);
   return result.rows[0]?decode(result.rows[0]):null;
  });
 }
 async function transition(id:string,from:string,to:string,result:unknown=null,error:NormalizedError|null=null):Promise<void> {
  return transaction(pool,scope,async client=>{
   const found=await client.query("SELECT run_id,writer_epoch FROM effect_journal WHERE effect_id=$1 AND tenant_id=$2", [OpaqueIdSchema.parse(id),scope.tenantId]);
   if(found.rows.length!==1) throw new Error("Effect intent not found");
   await fence(client,scope,found.rows[0].run_id,safeInteger(found.rows[0].writer_epoch,1));
   const updated=await client.query("UPDATE effect_journal SET status=$1,result_json=$2::jsonb,error_json=$3::jsonb,attempts=attempts+CASE WHEN $1='executing' THEN 1 ELSE 0 END,authorized_at=CASE WHEN $1='authorized' THEN clock_timestamp() ELSE authorized_at END,started_at=CASE WHEN $1='executing' THEN clock_timestamp() ELSE started_at END,completed_at=CASE WHEN $1 IN ('succeeded','failed','unknown') THEN clock_timestamp() ELSE completed_at END WHERE effect_id=$4 AND tenant_id=$5 AND status=$6 AND ($1<>'executing' OR attempts<max_attempts) RETURNING effect_id", [to,JSON.stringify(result),JSON.stringify(error),id,scope.tenantId,from]);
   if(updated.rows.length!==1) throw new Error("Effect transition denied or retry budget exhausted");
  });
 }
 return {
  recordEffectIntent:request=>transaction(pool,scope,async client=>{
   const parsed=EffectRequestSchema.parse(request);await checkContext(client,scope,parsed.runContext);
   const json=JSON.stringify(parsed);
   const result=await client.query("INSERT INTO effect_journal(effect_id,tenant_id,run_id,task_id,effect_type,action,resource,input_hash,artifact_hash,idempotency_key,status,writer_epoch,intent_json) VALUES ($1,$2,$3,NULL,'tool',$4,$5,$6,$7,$8,'planned',$9,$10::jsonb) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING effect_id", [parsed.effectId,scope.tenantId,parsed.runContext.runId,parsed.action,parsed.resource,Buffer.from(parsed.inputHash,"hex"),parsed.artifactHash?Buffer.from(parsed.artifactHash,"hex"):null,parsed.idempotencyKey,parsed.runContext.writerEpoch,json]);
   if(result.rows[0]) return result.rows[0].effect_id;
   const same=await client.query("SELECT effect_id FROM effect_journal WHERE tenant_id=$1 AND idempotency_key=$2 AND intent_json=$3::jsonb", [scope.tenantId,parsed.idempotencyKey,json]);
   if(same.rows.length!==1) throw new Error("Immutable effect intent conflict");
   return same.rows[0].effect_id;
  }),
  getEffect,
  authorizeEffect:id=>transition(id,"planned","authorized"),
  startEffect:id=>transition(id,"authorized","executing"),
  completeEffect:(id,result)=>transition(id,"executing","succeeded",boundedJsonObjectSchema(1048576).parse(result)),
  failEffect:(id,error)=>transition(id,"executing","failed",null,NormalizedErrorSchema.parse(error)),
  markUnknown:id=>transition(id,"executing","unknown"),
  reconcileEffect:async id=>{const record=await getEffect(id);if(!record)throw new Error("Effect intent not found");return {status:record.status,...(record.resultJson!==null?{result:record.resultJson}:{})};}
 };
}
export type { EffectRepository as EffectPort };

