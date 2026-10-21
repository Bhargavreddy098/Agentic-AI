import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { types } from "node:util";
import { AuditReceiptSchema, OpaqueIdSchema } from "@asi/contracts";
import type { AuditReceipt } from "@asi/contracts";

export type { AuditReceipt };
export interface VerificationResult { valid: boolean; reason?: string }
export interface AuditCheckpoint { tenantId: string; receiptCount: number; terminalSequence: number; terminalReceiptHash: string }
export interface ExportVerificationConfig { tenantId: string; verificationKeys: ReadonlyMap<string, Uint8Array>; checkpoint?: AuditCheckpoint }
export const GENESIS_HASH = "0".repeat(64);
export const MAX_CHAIN_RECEIPTS = 10000;
const MAX_RECEIPT_BYTES = 16384;
const MAX_EXPORT_BYTES = 16 * 1024 * 1024;

export function dataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Plain receipt data required");
  const copy: Record<string, unknown> = Object.create(null);
  const fields = Reflect.ownKeys(value);
  if (fields.length > 18) throw new Error("Too many receipt fields");
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) throw new Error("Only enumerable data fields are allowed");
    if (descriptor.value !== null && !["string", "number", "boolean"].includes(typeof descriptor.value)) throw new Error("Receipt fields must be primitive data");
    copy[key] = descriptor.value;
  }
  return copy;
}
export function canonicalReceipt(receipt: AuditReceipt | Omit<AuditReceipt, "signature">): string {
  return JSON.stringify(receipt, Object.keys(receipt).sort());
}
export function parseReceipt(value: unknown): AuditReceipt {
  const receipt = AuditReceiptSchema.parse(dataObject(value));
  if (!Number.isSafeInteger(receipt.sequence) || !/^[a-f0-9]{64}$/.test(receipt.signature)) throw new Error("Unsafe sequence or invalid HMAC encoding");
  if (Buffer.byteLength(canonicalReceipt(receipt)) > MAX_RECEIPT_BYTES) throw new Error("Receipt exceeds byte limit");
  return receipt;
}
export function receiptHash(receipt: AuditReceipt): string {
  return createHash("sha256").update(canonicalReceipt(receipt), "utf8").digest("hex");
}
export function signReceipt(body: Omit<AuditReceipt, "signature">, key: Uint8Array): string {
  return createHmac("sha256", key).update("ASI-AUDIT-RECEIPT-v1\n" + canonicalReceipt(body), "utf8").digest("hex");
}
export function copyKeys(keys: ReadonlyMap<string, Uint8Array>): Map<string, Buffer> {
  if (!(keys instanceof Map) || types.isProxy(keys) || keys.size < 1 || keys.size > 128) throw new Error("Trusted verification keys are required");
  const result = new Map<string, Buffer>();
  for (const [keyId, key] of Map.prototype.entries.call(keys)) {
    OpaqueIdSchema.parse(keyId);
    if (!(key instanceof Uint8Array) || types.isProxy(key) || key.byteLength < 32 || key.byteLength > 4096) throw new Error("Invalid trusted HMAC key");
    result.set(keyId, Buffer.from(key));
  }
  return result;
}
export function parseCheckpoint(value: unknown): AuditCheckpoint {
  const data = dataObject(value);
  if (Object.keys(data).sort().join(",") !== "receiptCount,tenantId,terminalReceiptHash,terminalSequence" ||
      !Number.isSafeInteger(data["receiptCount"]) || Number(data["receiptCount"]) < 0 ||
      !Number.isSafeInteger(data["terminalSequence"]) || Number(data["terminalSequence"]) < 0 ||
      typeof data["terminalReceiptHash"] !== "string" || !/^[a-f0-9]{64}$/.test(data["terminalReceiptHash"])) throw new Error("Invalid external checkpoint");
  return { tenantId: OpaqueIdSchema.parse(data["tenantId"]), receiptCount: Number(data["receiptCount"]),
    terminalSequence: Number(data["terminalSequence"]), terminalReceiptHash: data["terminalReceiptHash"] };
}
/** Integrity requires trusted keys; tail truncation detection additionally requires an independently retained checkpoint. */
export async function verifyExportedReceiptChain(values: readonly AuditReceipt[], config: ExportVerificationConfig): Promise<VerificationResult> {
  try {
    const tenantId = OpaqueIdSchema.parse(config.tenantId), keys = copyKeys(config.verificationKeys);
    if (types.isProxy(values) || !Array.isArray(values) || values.length > MAX_CHAIN_RECEIPTS) throw new Error("Bounded receipt array required");
    let previousHash = GENESIS_HASH, bytes = 0;
    const effects = new Set<string>(), identities = new Set<string>();
    for (let i = 0; i < values.length; i++) {
      const slot = Object.getOwnPropertyDescriptor(values, String(i));
      if (!slot || !("value" in slot)) throw new Error("Receipt array must contain data elements");
      const receipt = parseReceipt(slot.value);
      bytes += Buffer.byteLength(canonicalReceipt(receipt));
      if (bytes > MAX_EXPORT_BYTES) throw new Error("Export exceeds byte limit");
      if (receipt.tenantId !== tenantId) throw new Error("Receipt tenant mismatch");
      if (receipt.sequence !== i + 1) throw new Error("Receipt sequence gap or reordering");
      if (receipt.previousHash !== previousHash) throw new Error("Receipt previousHash mismatch");
      if (identities.has(receipt.receiptId) || effects.has(receipt.effectId)) throw new Error("Duplicate receipt or effect identity");
      const key = keys.get(receipt.keyId);
      if (!key) throw new Error("Unknown verification keyId");
      const { signature, ...body } = receipt;
      if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signReceipt(body, key), "hex"))) throw new Error("Receipt signature verification failed");
      identities.add(receipt.receiptId); effects.add(receipt.effectId);
      previousHash = receiptHash(receipt);
    }
    if (config.checkpoint !== undefined) {
      const checkpoint = parseCheckpoint(config.checkpoint);
      if (checkpoint.tenantId !== tenantId || checkpoint.receiptCount !== values.length ||
          checkpoint.terminalSequence !== values.length || checkpoint.terminalReceiptHash !== previousHash) throw new Error("External terminal checkpoint mismatch");
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "Receipt verification failed" };
  }
}

export const MAX_RECEIPT_CHUNK = 1000;
export interface ChunkVerificationConfig extends ExportVerificationConfig { signal?: AbortSignal }
async function streamWait<T>(operation: () => Promise<T>, until: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted || Date.now() >= until) throw new Error("Audit verification cancelled or timed out");
  return new Promise((resolve,reject) => {
    let settled = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort",cancel); };
    const cancel = () => { if (!settled) { settled=true;cleanup();reject(new Error("Audit verification cancelled or timed out")); } };
    const timer = setTimeout(cancel,Math.max(0,Math.min(5000,until-Date.now())));
    signal?.addEventListener("abort",cancel,{once:true});
    if (signal?.aborted) { cancel();return; }
    try {
      operation().then(value=>{if(!settled){settled=true;cleanup();resolve(value);}},error=>{if(!settled){settled=true;cleanup();reject(error);}});
    } catch(error) {settled=true;cleanup();reject(error);}
  });
}
/** Trusted offline async source; constant history state, bounded batches, independently trusted keys/checkpoint. */
export async function verifyReceiptChainChunks(chunks: AsyncIterable<readonly AuditReceipt[]>, config: ChunkVerificationConfig): Promise<VerificationResult> {
  let iterator: AsyncIterator<readonly AuditReceipt[]> | undefined;
  const until = Date.now()+30000;
  try {
    const tenantId=OpaqueIdSchema.parse(config.tenantId),keys=copyKeys(config.verificationKeys);
    const checkpoint=config.checkpoint===undefined?undefined:parseCheckpoint(config.checkpoint);
    iterator=chunks[Symbol.asyncIterator]();
    let sequence=0,previousHash=GENESIS_HASH;
    while(true) {
      const step=await streamWait(()=>iterator!.next(),until,config.signal);
      if(!step || typeof step!=="object" || types.isProxy(step)) throw new Error("Invalid audit source step");
      const done=Object.getOwnPropertyDescriptor(step,"done"),value=Object.getOwnPropertyDescriptor(step,"value");
      if(!done || !("value" in done) || typeof done.value!=="boolean" || (value && !("value" in value))) throw new Error("Audit source steps must contain data");
      if(done.value) break;
      const batch:unknown=value?.value;
      if(types.isProxy(batch) || !Array.isArray(batch) || batch.length<1 || batch.length>MAX_RECEIPT_CHUNK) throw new Error("Invalid receipt chunk size");
      let bytes=0;
      const identities=new Set<string>(),effects=new Set<string>();
      for(let i=0;i<batch.length;i++) {
        if(config.signal?.aborted || Date.now()>=until) throw new Error("Audit verification cancelled or timed out");
        const slot=Object.getOwnPropertyDescriptor(batch,String(i));
        if(!slot || !("value" in slot)) throw new Error("Receipt chunk must contain data elements");
        const receipt=parseReceipt(slot.value);
        bytes+=Buffer.byteLength(canonicalReceipt(receipt));
        if(bytes>MAX_EXPORT_BYTES || !Number.isSafeInteger(sequence+1)) throw new Error("Audit stream limit exceeded");
        if(receipt.tenantId!==tenantId || receipt.sequence!==sequence+1 || receipt.previousHash!==previousHash) throw new Error("Receipt stream tenant, sequence or previousHash mismatch");
        if(identities.has(receipt.receiptId) || effects.has(receipt.effectId)) throw new Error("Duplicate receipt or effect in chunk");
        const key=keys.get(receipt.keyId),{signature,...body}=receipt;
        if(!key || !timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(signReceipt(body,key),"hex"))) throw new Error("Receipt stream signature verification failed");
        identities.add(receipt.receiptId);effects.add(receipt.effectId);sequence++;previousHash=receiptHash(receipt);
      }
    }
    if(checkpoint && (checkpoint.tenantId!==tenantId || checkpoint.receiptCount!==sequence ||
      checkpoint.terminalSequence!==sequence || checkpoint.terminalReceiptHash!==previousHash)) throw new Error("External terminal checkpoint mismatch");
    return {valid:true};
  } catch(error) {return {valid:false,reason:error instanceof Error?error.message:"Receipt stream verification failed"};}
  finally {
    // Caller-owned sources must honor cancellation too; never wait indefinitely for iterator cleanup.
    if(iterator?.return) await streamWait(()=>iterator!.return!(),Date.now()+1000).catch(()=>undefined);
  }
}
