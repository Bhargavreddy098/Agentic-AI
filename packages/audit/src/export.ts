import type { Pool } from "pg";
import type { AuditReceipt } from "@asi/contracts";
import { auditTransaction, safeSequence, storedReceipt } from "./append.js";
import { GENESIS_HASH, MAX_CHAIN_RECEIPTS, receiptHash, parseCheckpoint, MAX_RECEIPT_CHUNK, verifyReceiptChainChunks } from "./verify.js";
import type { AuditCheckpoint, VerificationResult } from "./verify.js";
export interface ExportReceiptConfig { pool: Pool; tenantId: string; signal?: AbortSignal }
export interface VerifyReceiptConfig extends ExportReceiptConfig { verificationKeys: ReadonlyMap<string, Uint8Array>; checkpoint?: AuditCheckpoint }
export interface ExportedReceiptChain {
  tenantId: string; exportedAt: string; receiptCount: number; terminalReceiptHash: string;
  receipts: AuditReceipt[]; complete: boolean; checkpoint: AuditCheckpoint;
}
function bound(value: bigint | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "bigint" || value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsafe export sequence bound");
  return Number(value);
}
export async function exportReceiptChain(config: ExportReceiptConfig, fromSequence?: bigint, toSequence?: bigint): Promise<ExportedReceiptChain> {
  const from = bound(fromSequence), to = bound(toSequence);
  if (from !== undefined && to !== undefined && from > to) throw new Error("Invalid export range");
  return auditTransaction(config.pool, config.tenantId, config.signal, true, async query => {
    // Snapshot head and rows together; concurrent append cannot produce an inconsistent export.
    const heads = await query("SELECT sequence,receipt_hash FROM audit_chain_heads WHERE tenant_id=$1", [config.tenantId]);
    const head = heads.rows[0], sequence = head ? safeSequence(head["sequence"]) : 0;
    const terminalReceiptHash = head ? (Buffer.isBuffer(head["receipt_hash"]) && head["receipt_hash"].length === 32 ? head["receipt_hash"].toString("hex") : "") : GENESIS_HASH;
    if (!terminalReceiptHash) throw new Error("Invalid stored audit head");
    const tails=await query("SELECT sequence,receipt_json,canonical_bytes,receipt_hash FROM audit_receipts WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1",[config.tenantId]);
    const tail=tails.rows[0];
    if(sequence!==(tail?safeSequence(tail["sequence"],1):0) ||
      terminalReceiptHash!==(tail?receiptHash(storedReceipt(tail)):GENESIS_HASH)) throw new Error("Stored audit head does not match receipt history");
    const checkpoint = { tenantId: config.tenantId, receiptCount: sequence, terminalSequence: sequence, terminalReceiptHash };
    const result = await query("SELECT receipt_json,canonical_bytes,receipt_hash FROM audit_receipts WHERE tenant_id=$1 AND ($2::bigint IS NULL OR sequence >= $2) AND ($3::bigint IS NULL OR sequence <= $3) ORDER BY sequence LIMIT $4", [config.tenantId, from ?? null, to ?? null, MAX_CHAIN_RECEIPTS + 1]);
    if (result.rows.length > MAX_CHAIN_RECEIPTS) throw new Error("Audit export exceeds receipt limit; use explicit diagnostic ranges");
    let byteCount = 0;
    const receipts = result.rows.map(row => {
      byteCount += row["canonical_bytes"]?.length ?? 0;
      if (byteCount > 16 * 1024 * 1024) throw new Error("Audit export exceeds byte limit");
      return storedReceipt(row);
    });
    const complete = from === undefined && to === undefined;
    if (complete && (receipts.length !== sequence || (receipts.at(-1) ? receiptHash(receipts.at(-1)!) : GENESIS_HASH) !== terminalReceiptHash)) throw new Error("Stored audit chain is incomplete");
    return { tenantId: config.tenantId, exportedAt: new Date().toISOString(), receiptCount: receipts.length,
      terminalReceiptHash, receipts, complete, checkpoint };
  });
}
export async function verifyReceiptChain(config: VerifyReceiptConfig): Promise<VerificationResult> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  const signal=config.signal?AbortSignal.any([controller.signal,config.signal]):controller.signal;
  try {
    const bounded={...config,signal};
    const initial=await exportReceiptChain(bounded,1n,1n);
    const checkpoint=config.checkpoint??initial.checkpoint;
    return await verifyReceiptChainChunks(exportReceiptChainChunks(bounded,checkpoint), {
      tenantId:config.tenantId,verificationKeys:config.verificationKeys,checkpoint,signal });
  } catch(error) {return {valid:false,reason:error instanceof Error?error.message:"Audit storage unavailable"};}
  finally {clearTimeout(timer);controller.abort();}
}

/** Each bounded page releases its snapshot before yielding. A retained checkpoint fixes an immutable prefix. */
export async function* exportReceiptChainChunks(config: ExportReceiptConfig, expected: AuditCheckpoint): AsyncGenerator<AuditReceipt[]> {
  const checkpoint=parseCheckpoint(expected);
  if(checkpoint.tenantId!==config.tenantId || checkpoint.receiptCount!==checkpoint.terminalSequence) throw new Error("Invalid checkpoint scope/count");
  const initial=await exportReceiptChain(config,1n,1n);
  if(checkpoint.terminalSequence>initial.checkpoint.terminalSequence) throw new Error("Checkpoint exceeds stored audit head");
  for(let start=1;start<=checkpoint.terminalSequence;start+=MAX_RECEIPT_CHUNK) {
    const end=Math.min(checkpoint.terminalSequence,start+MAX_RECEIPT_CHUNK-1);
    const page=await exportReceiptChain(config,BigInt(start),BigInt(end));
    if(page.receipts.length!==end-start+1) throw new Error("Audit prefix is incomplete");
    yield page.receipts;
  }
}
