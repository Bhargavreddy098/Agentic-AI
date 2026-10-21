import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { OpaqueIdSchema } from "@asi/contracts";
import type { AuditReceipt } from "@asi/contracts";
import { GENESIS_HASH, canonicalReceipt, copyKeys, dataObject, parseReceipt, receiptHash, signReceipt, verifyExportedReceiptChain } from "./verify.js";
import type { AuditCheckpoint, VerificationResult } from "./verify.js";
export type { AuditReceipt, VerificationResult };
export type AppendReceiptInput = Omit<AuditReceipt, "sequence" | "previousHash" | "signature">;
export interface AuditAppendConfig {
  pool: Pool; tenantId: string; ownerId: string; keyId: string; signingKey: Uint8Array;
  verificationKeys?: ReadonlyMap<string, Uint8Array>; signal?: AbortSignal;
}
export interface AppendReceiptResult { receipt: AuditReceipt; sequence: bigint }
export interface AuditService {
  appendReceipt(input: AppendReceiptInput): Promise<AuditReceipt>;
  verifyReceiptChain(receipts: readonly AuditReceipt[], checkpoint?: AuditCheckpoint): Promise<VerificationResult>;
}
export function safeSequence(value: unknown, minimum = 0): number {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) throw new Error("Invalid persisted sequence");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error("Unsafe persisted sequence");
  return number;
}
const poolAdmission = new WeakMap<Pool, number>();
function validatePool(pool: Pool) {
  const timeout = pool?.options?.connectionTimeoutMillis;
  if (!pool || typeof pool.connect !== "function" || !Number.isInteger(timeout) || Number(timeout) < 1 || Number(timeout) > 5000) throw new Error("Trusted audit pool requires bounded connectionTimeoutMillis from1through5000");
}
function aborted(signal?: AbortSignal) { if (signal?.aborted) throw new Error("Audit operation cancelled"); }
async function connection(pool: Pool, signal?: AbortSignal): Promise<PoolClient> {
  aborted(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, client?: PoolClient) => {
      if (settled) { client?.release(); return; }
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(client!);
    };
    const cancel = () => finish(new Error("Audit operation cancelled"));
    const timer = setTimeout(() => finish(new Error("Audit connection timeout")), 5000);
    signal?.addEventListener("abort", cancel, { once: true });
    pool.connect().then(client => finish(undefined, client), error => finish(error));
    if (signal?.aborted) cancel();
  });
}
function boundedIO<T>(operation: () => Promise<T>, until: number, signal: AbortSignal | undefined, destroy: () => void): Promise<T> {
  aborted(signal);
  if (Date.now() >= until) { destroy(); throw new Error("Audit operation timeout"); }
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true; cleanup(); destroy(); reject(error);
    };
    const cancel = () => fail(new Error("Audit operation cancelled"));
    const timer = setTimeout(() => fail(new Error("Audit operation timeout")), Math.max(0, until - Date.now()));
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      operation().then(value => {
        if (settled) return;
        settled = true; cleanup(); resolve(value);
      }, error => {
        if (settled) return;
        settled = true; cleanup(); reject(error);
      });
    } catch (error) { settled = true; cleanup(); reject(error); }
  });
}
export type AuditQuery = <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;
async function runAuditTransaction<T>(pool: Pool, tenantId: string, signal: AbortSignal | undefined,
    readOnly: boolean, work: (query: AuditQuery) => Promise<T>, ownerId = ""): Promise<T> {
  OpaqueIdSchema.parse(tenantId);
  const client = await connection(pool, signal), until = Date.now() + 5000;
  let released = false;
  const destroy = () => { if (!released) { released = true; client.release(true); } };
  const io = <R>(operation: () => Promise<R>) => boundedIO(operation, until, signal, destroy);
  const query: AuditQuery = async (sql, params) => {
    aborted(signal);
    const remaining = until - Date.now();
    if (remaining <= 0) { destroy(); throw new Error("Audit operation timeout"); }
    await io(() => client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", [String(remaining)]));
    const result = await io(() => client.query(sql, params));
    aborted(signal); return result;
  };
  try {
    await io(() => client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN"));
    await query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id',$2,true)", [tenantId, ownerId]);
    const result = await work(query);
    aborted(signal);
    await query("COMMIT");
    return result;
  } catch (error) {
    // A timed out/cancelled socket is destroyed, never returned to the shared pool.
    if (!released) await boundedIO(() => client.query("ROLLBACK"), Date.now() + 1000, undefined, destroy).catch(() => undefined);
    throw error;
  } finally { if (!released) { released = true; client.release(); } }

}
export async function auditTransaction<T>(pool: Pool, tenantId: string, signal: AbortSignal | undefined,
    readOnly: boolean, work: (query: AuditQuery) => Promise<T>, ownerId = ""): Promise<T> {
  validatePool(pool);
  const count=poolAdmission.get(pool)??0;
  if(count>=64) throw new Error("Audit pool admission limit exceeded");
  poolAdmission.set(pool,count+1);
  try {return await runAuditTransaction(pool,tenantId,signal,readOnly,work,ownerId);}
  finally {const active=(poolAdmission.get(pool)??1)-1;if(active===0)poolAdmission.delete(pool);else poolAdmission.set(pool,active);}
}
export function createAuditService(config: AuditAppendConfig): AuditService {
  const tenantId = OpaqueIdSchema.parse(config.tenantId), ownerId = OpaqueIdSchema.parse(config.ownerId),
    keyId = OpaqueIdSchema.parse(config.keyId), pool = config.pool, signal = config.signal;
  validatePool(pool);
  const signingKey = copyKeys(new Map([[keyId, config.signingKey]])).get(keyId)!;
  const keys = copyKeys(config.verificationKeys ?? new Map([[keyId, signingKey]]));
  // Key rotation can retain old keys, but the active signing key must verify its own output.
  keys.set(keyId, Buffer.from(signingKey));
  return {
    appendReceipt: async input => {
      const fields = dataObject(input);
      const parsed = parseReceipt({ ...fields, sequence: 1, previousHash: GENESIS_HASH, signature: GENESIS_HASH });
      if (Object.keys(fields).length !== Object.keys(parsed).length - 3 ||
          ["sequence", "previousHash", "signature"].some(key => Object.hasOwn(fields, key))) throw new Error("Only canonical append fields are accepted");
      if (parsed.tenantId !== tenantId || parsed.keyId !== keyId) throw new Error("Authenticated tenant or signing key mismatch");
      return auditTransaction(pool, tenantId, signal, false, async query => {
        await query("SELECT session_id FROM sessions WHERE session_id=$1 AND tenant_id=$2 FOR UPDATE", [parsed.sessionId, tenantId]);
        await query("SELECT run_id FROM runs WHERE run_id=$1 AND session_id=$2 AND tenant_id=$3 FOR UPDATE", [parsed.runId, parsed.sessionId, tenantId]);
        await query("SELECT session_id FROM writer_leases WHERE session_id=$1 AND run_id=$2 AND tenant_id=$3 FOR UPDATE", [parsed.sessionId, parsed.runId, tenantId]);
        const effects = await query("SELECT run_id,writer_epoch,input_hash,status,intent_json FROM effect_journal WHERE effect_id=$1 AND tenant_id=$2", [parsed.effectId, tenantId]);
        const effect = effects.rows[0];
        if (!effect || effect["run_id"] !== parsed.runId || !Buffer.isBuffer(effect["input_hash"]) ||
            effect["input_hash"].toString("hex") !== parsed.inputHash ||
            effect["intent_json"]?.runContext?.sessionId !== parsed.sessionId ||
            effect["intent_json"]?.runContext?.mode !== parsed.mode ||
            !(effect["status"] === "executing" || effect["status"] === parsed.status)) throw new Error("Receipt effect binding denied");
        await query("INSERT INTO audit_chain_heads(tenant_id,sequence,receipt_hash) VALUES ($1,0,$2) ON CONFLICT(tenant_id) DO NOTHING", [tenantId, Buffer.from(GENESIS_HASH, "hex")]);
        const heads = await query("SELECT sequence,receipt_hash FROM audit_chain_heads WHERE tenant_id=$1 FOR UPDATE", [tenantId]);
        const head = heads.rows[0];
        if (!head || !Buffer.isBuffer(head["receipt_hash"]) || head["receipt_hash"].length !== 32) throw new Error("Invalid audit chain head");
        await query("SELECT m04_require_writer($1,$2,$3)", [parsed.runId, tenantId, safeSequence(effect["writer_epoch"], 1)]);
        const existing = await query("SELECT receipt_json,canonical_bytes,receipt_hash FROM audit_receipts WHERE tenant_id=$1 AND effect_id=$2", [tenantId, parsed.effectId]);
        if (existing.rows.length) {
          const receipt = storedReceipt(existing.rows[0]!);
          const ignored = new Set(["sequence", "previousHash", "signature", "timestamp", "keyId"]);
          for (const field of Object.keys(parsed) as Array<keyof AuditReceipt>) {
            if (!ignored.has(field) && parsed[field] !== receipt[field]) throw new Error("Immutable receipt outcome conflict");
          }
          const key = keys.get(receipt.keyId);
          const { signature, ...body } = receipt;
          if (!key || signReceipt(body, key) !== signature) throw new Error("Stored receipt signature mismatch");
          return receipt;
        }
        const sequence = safeSequence(safeSequence(head["sequence"]) + 1, 1);
        const time = (await query("SELECT clock_timestamp() AS timestamp")).rows[0]?.["timestamp"];
        if (!(time instanceof Date) || !Number.isFinite(time.getTime())) throw new Error("Invalid database timestamp");
        const body: Omit<AuditReceipt,"signature"> & { signature?: string } = { ...parsed, sequence, previousHash: head["receipt_hash"].toString("hex"), timestamp: time.toISOString() };
        delete body.signature;
        const receipt = parseReceipt({ ...body, signature: signReceipt(body, signingKey) });
        await query("INSERT INTO audit_receipts(receipt_id,tenant_id,session_id,run_id,effect_id,sequence,previous_hash,input_hash,output_hash,status,mode,policy_version,timestamp,key_id,signature,receipt_json,canonical_bytes,receipt_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18)",
          [receipt.receiptId, tenantId, receipt.sessionId, receipt.runId, receipt.effectId, sequence,
            Buffer.from(receipt.previousHash, "hex"), Buffer.from(receipt.inputHash, "hex"), Buffer.from(receipt.outputHash, "hex"),
            receipt.status, receipt.mode, receipt.policyVersion, receipt.timestamp, receipt.keyId, Buffer.from(receipt.signature, "hex"),
            JSON.stringify(receipt), Buffer.from(canonicalReceipt(receipt), "utf8"), Buffer.from(receiptHash(receipt), "hex")]);
        return receipt;
      }, ownerId);
    },
    verifyReceiptChain: (receipts, checkpoint) => verifyExportedReceiptChain(receipts, { tenantId, verificationKeys: keys, ...(checkpoint ? { checkpoint } : {}) }),
  };
}
export function storedReceipt(row: QueryResultRow): AuditReceipt {
  const receipt = parseReceipt(row["receipt_json"]);
  if (!Buffer.isBuffer(row["canonical_bytes"]) || row["canonical_bytes"].toString("utf8") !== canonicalReceipt(receipt) ||
      !Buffer.isBuffer(row["receipt_hash"]) || row["receipt_hash"].toString("hex") !== receiptHash(receipt)) throw new Error("Stored receipt hash/canonical encoding mismatch");
  return receipt;
}
/** Compatibility wrapper: incomplete legacy payloads deny rather than fabricating canonical identities or output hashes. */
export async function appendReceipt(config: AuditAppendConfig, input: AppendReceiptInput): Promise<AppendReceiptResult> {
  const receipt = await createAuditService(config).appendReceipt(input);
  return { receipt, sequence: BigInt(receipt.sequence) };
}
