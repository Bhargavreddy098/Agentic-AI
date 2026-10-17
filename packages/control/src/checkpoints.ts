import type { Pool } from "pg";
import type { Checkpoint } from "@asi/contracts";
import { CheckpointSchema, RunContextSchema, UtcTimestampSchema, OpaqueIdSchema } from "@asi/contracts";
import { bindScope, transaction, checkContext, safeInteger } from "./runtime.js";
import type { ControlScope } from "./runtime.js";
export interface CheckpointRepository {
 saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
 getLatestCheckpoint(runId: string): Promise<Checkpoint | null>;
 getCheckpoint(runId: string, version: number): Promise<Checkpoint | null>;
}
const HistoricalCheckpoint = CheckpointSchema.extend({ runContext: RunContextSchema.extend({ deadlineAt: UtcTimestampSchema }) });
export function createCheckpointRepository(pool: Pool, input?: ControlScope): CheckpointRepository {
 const scope = bindScope(input);
 async function read(runId: string, version?: number): Promise<Checkpoint | null> {
  return transaction(pool, scope, async client => {
   const result = await client.query("SELECT * FROM checkpoints WHERE run_id=$1 AND tenant_id=$2 AND ($3::bigint IS NULL OR version=$3) ORDER BY version DESC LIMIT 1", [OpaqueIdSchema.parse(runId), scope.tenantId, version === undefined ? null : safeInteger(version, 1)]);
   const row = result.rows[0];
   if (!row) return null;
   const value = HistoricalCheckpoint.parse(row.checkpoint_json);
   if (value.checkpointId!==row.checkpoint_id || value.runContext.runId!==row.run_id || value.runContext.budgetRef.tenantId!==row.tenant_id || value.version!==safeInteger(row.version,1) || value.runContext.writerEpoch!==safeInteger(row.writer_epoch,1)) throw new Error("Invalid checkpoint identity");
   return value;
  });
 }
 return {
  saveCheckpoint: checkpoint => transaction(pool, scope, async client => {
   const parsed = CheckpointSchema.parse(checkpoint);
   safeInteger(parsed.version,1);
   await checkContext(client,scope,parsed.runContext);
   const json = JSON.stringify(parsed);
   const result = await client.query("INSERT INTO checkpoints(checkpoint_id,run_id,tenant_id,writer_epoch,state_json,completed_task_ids,completed_effect_ids,model_result_refs,version,checkpoint_json) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10::jsonb) ON CONFLICT(run_id,version) DO NOTHING RETURNING checkpoint_id", [parsed.checkpointId,parsed.runContext.runId,scope.tenantId,parsed.runContext.writerEpoch,JSON.stringify(parsed.state),parsed.completedTaskIds,parsed.completedEffectIds,JSON.stringify(parsed.modelResultRefs),parsed.version,json]);
   if (result.rows.length===0) {
    const existing = await client.query("SELECT checkpoint_id FROM checkpoints WHERE run_id=$1 AND version=$2 AND checkpoint_json=$3::jsonb", [parsed.runContext.runId,parsed.version,json]);
    if (existing.rows.length!==1) throw new Error("Checkpoint history conflict");
   }
  }),
  getLatestCheckpoint: runId => read(runId),
  getCheckpoint: (runId,version) => read(runId,version)
 };
}
export type { CheckpointRepository as CheckpointPort };

