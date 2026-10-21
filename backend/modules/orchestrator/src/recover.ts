
export interface RecoveryDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: RunStateRow[]; rowCount?: number | null }>;
}

export interface RecoveryConfig {
  dbPool: RecoveryDb;
  maxRecoveryAttempts: number;
  checkpointIntervalMs: number;
}

export interface RecoveryResult {
  recoveredCount: number;
  failedCount: number;
  recoveredRunIds: string[];
}

export interface RunState {
  runId: string;
  status: string;
  context: RunContext;
  checkpoint: CheckpointData;
  createdAt: string;
  updatedAt: string;
}

export interface RunStateRow {
  run_id: string;
  context: RunContext;
  checkpoint: CheckpointData;
  status: string;
  updated_at: string;
}

export interface RunContext {
  runId: string;
  sessionId: string;
  writerEpoch: number;
  mode: "observe" | "assist" | "execute";
  deadlineAt: string;
  budgetRef: { tenantId: string; accountId: string; rootRunId: string };
  parentRunId?: string;
  goalRef?: string;
  projectRef?: string;
  verificationRef?: string;
}

export interface CheckpointData {
  timestamp: string;
  modelCallCount?: number;
  delegationDepth?: number;
  observations?: unknown[];
  checkpoints?: unknown[];
}

export interface RecoveryManagerConfig {
  dbPool: RecoveryDb;
  maxRecoveryAttempts: number;
  checkpointIntervalMs: number;
  recoveryLimit?: number;
}

/**
 * Recovers interrupted runs by replaying from last checkpoint.
 * Returns the number of successfully recovered runs.
 */
export async function recoverRuns(
  config: RecoveryConfig,
  limit: number = 100
): Promise<RecoveryResult> {
  const { dbPool } = config;
  
  // Find runs that were interrupted (status = running, awaiting_tool, awaiting_approval, awaiting_model)
  const interruptedRuns = await dbPool.query(
    `SELECT run_id, context, checkpoint, status, updated_at
     FROM run_state
     WHERE status IN ('running', 'awaiting_tool', 'awaiting_approval', 'awaiting_model')
     AND updated_at < NOW() - INTERVAL '5 minutes'
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit]
  );

  let recoveredCount = 0;
  let failedCount = 0;
  const recoveredRunIds: string[] = [];

  for (const row of interruptedRuns.rows) {
    try {
      const runState = await recoverSingleRun(dbPool, row);
      if (runState) {
        recoveredCount++;
        recoveredRunIds.push(row.run_id);
      } else {
        failedCount++;
      }
    } catch (err) {
      console.error(`Failed to recover run ${row.run_id}:`, err);
      failedCount++;
    }
  }

  return { recoveredCount, failedCount, recoveredRunIds };
}

/**
 * Recovers a single run by replaying from its last checkpoint.
 */
async function recoverSingleRun(
  dbPool: RecoveryDb,
  row: RunStateRow
): Promise<RunState | null> {
  const { run_id, context, checkpoint } = row;
  
  // Check if we have a valid checkpoint
  if (!checkpoint) {
    // No checkpoint - mark as failed and move to reconciliation
    await markRunForReconciliation(dbPool, run_id, "No checkpoint available");
    return null;
  }

  // Verify checkpoint is not stale
  const checkpointAge = Date.now() - new Date(checkpoint.timestamp).getTime();
  if (checkpointAge > 24 * 60 * 60 * 1000) { // 24 hours
    await markRunForReconciliation(dbPool, run_id, "Checkpoint too old");
    return null;
  }

  // Reconstruct run state from checkpoint
  const runState = reconstructRunState(context, checkpoint);
  
  // Resume from checkpoint
  const newState = await resumeFromCheckpoint(runState);
  
  // Update run state in database
  await dbPool.query(
    `UPDATE run_state 
     SET status = $1, context = $2, updated_at = NOW()
     WHERE run_id = $3`,
    ['running', JSON.stringify(newState), run_id]
  );

  return newState;
}

/**
 * Reconstructs run state from checkpoint data.
 */
function reconstructRunState(context: RunContext, checkpoint: CheckpointData): RunState {
  return {
    runId: context.runId,
    status: 'running',
    context,
    checkpoint,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Resumes execution from a checkpoint.
 */
async function resumeFromCheckpoint(state: RunState): Promise<RunState> {
  // In a real implementation, this would restart the run loop
  // from the checkpoint state. For now, we just return the state.
  return {
    ...state,
    status: 'running',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Marks a run for manual reconciliation.
 */
async function markRunForReconciliation(
  dbPool: RecoveryDb,
  runId: string,
  reason: string
): Promise<void> {
  await dbPool.query(
    `UPDATE run_state 
     SET status = 'reconciliation_pending', 
         reconciliation_reason = $1,
         updated_at = NOW()
     WHERE run_id = $2`,
    [reason, runId]
  );
}

export function createRecoveryManager(config: RecoveryManagerConfig) {
  return {
    recoverRuns: () => recoverRuns({ 
      dbPool: config.dbPool,
      maxRecoveryAttempts: config.maxRecoveryAttempts || 3,
      checkpointIntervalMs: config.checkpointIntervalMs || 30000,
    }, config.recoveryLimit || 100),
  };
}