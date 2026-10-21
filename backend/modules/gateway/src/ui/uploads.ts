import { createHash } from "node:crypto";
import type { ErrorCode, UploadIntent, UploadView } from "@asi/contracts";
import type { UiUploadLimits, UiUploadPort } from "./ports.js";

const BLOCKED_MIME_TYPES = new Set([
  "application/javascript",
  "text/javascript",
  "application/x-javascript",
  "application/x-msdownload",
  "application/x-dosexec",
  "application/x-sh",
  "application/x-executable",
  "application/x-httpd-php",
  "text/html",
]);

type UploadStatus = UploadView["status"];

interface UploadEntry {
  uploadId: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  declaredByteSize: number;
  status: UploadStatus;
  reason?: string;
  attachmentId?: string;
  bytes?: Uint8Array;
  digest?: string;
}

export interface UploadWriteResult {
  ok: boolean;
  code: ErrorCode;
  message: string;
}

function toView(entry: UploadEntry): UploadView {
  return {
    uploadId: entry.uploadId,
    status: entry.status,
    ...(entry.attachmentId ? { attachmentId: entry.attachmentId } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
  };
}

function rejectionReason(intent: UploadIntent, limits: UiUploadLimits): string | null {
  if (intent.byteSize > limits.maxAttachmentBytes) return "Attachment exceeds the workspace size limit.";
  if (BLOCKED_MIME_TYPES.has(intent.mimeType.toLowerCase())) return "Attachment type is blocked by policy.";
  return null;
}

export class UploadQuarantine {
  private readonly entries = new Map<string, UploadEntry>();
  private readonly released = new Map<string, Set<string>>();

  constructor(
    private readonly port: UiUploadPort,
    private readonly limits: UiUploadLimits,
    private readonly now: () => number,
  ) {}

  begin(workspaceId: string, intent: UploadIntent): UploadView {
    const uploadId = `upload-${this.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const reason = rejectionReason(intent, this.limits);
    const entry: UploadEntry = {
      uploadId,
      workspaceId,
      fileName: intent.fileName,
      mimeType: intent.mimeType,
      declaredByteSize: intent.byteSize,
      status: reason ? "rejected" : "uploading",
      ...(reason ? { reason } : {}),
    };
    this.entries.set(uploadId, entry);
    return toView(entry);
  }

  write(workspaceId: string, uploadId: string, bytes: Uint8Array): UploadWriteResult {
    const entry = this.owned(workspaceId, uploadId);
    if (!entry) return { ok: false, code: "POLICY_DENIED", message: "Upload unavailable." };
    if (entry.status !== "uploading") return { ok: false, code: "POLICY_DENIED", message: "Upload is not accepting content." };
    if (bytes.byteLength > entry.declaredByteSize || bytes.byteLength > this.limits.maxAttachmentBytes) {
      entry.status = "rejected";
      entry.reason = "Uploaded content exceeds the declared size.";
      delete entry.bytes;
      delete entry.digest;
      return { ok: false, code: "POLICY_DENIED", message: "Uploaded content exceeds the declared size." };
    }
    entry.bytes = bytes;
    entry.digest = createHash("sha256").update(bytes).digest("hex");
    return { ok: true, code: "INVALID_INPUT", message: "" };
  }

  async complete(workspaceId: string, uploadId: string, commandId: string): Promise<UploadView | null> {
    const entry = this.owned(workspaceId, uploadId);
    if (!entry) return null;
    void commandId;
    if (entry.status === "rejected") return toView(entry);
    if (!entry.bytes || !entry.digest) {
      entry.status = "rejected";
      entry.reason = "Upload content was missing.";
      return toView(entry);
    }
    let scan: Awaited<ReturnType<UiUploadPort["scan"]>>;
    try {
      scan = await this.port.scan({
        workspaceId,
        uploadId,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
        byteSize: entry.bytes.byteLength,
        digest: entry.digest,
      });
    } catch {
      scan = { status: "unavailable" };
    }
    if (scan.status === "ready" && scan.attachmentId) {
      entry.status = "ready";
      entry.attachmentId = scan.attachmentId;
      this.releasedFor(workspaceId).add(scan.attachmentId);
    } else if (scan.status === "rejected") {
      entry.status = "rejected";
      entry.reason = scan.reason ?? "Upload was rejected.";
    } else {
      entry.status = "rejected";
      entry.reason = scan.reason ?? "Upload authorization service is unavailable.";
    }
    delete entry.bytes;
    delete entry.digest;
    await this.port.discard(workspaceId, uploadId).catch(() => undefined);
    return toView(entry);
  }

  view(workspaceId: string, uploadId: string): UploadView | null {
    const entry = this.owned(workspaceId, uploadId);
    return entry ? toView(entry) : null;
  }

  isReleased(workspaceId: string, attachmentId: string): boolean {
    return this.releasedFor(workspaceId).has(attachmentId);
  }

  private owned(workspaceId: string, uploadId: string): UploadEntry | undefined {
    const entry = this.entries.get(uploadId);
    return entry && entry.workspaceId === workspaceId ? entry : undefined;
  }

  private releasedFor(workspaceId: string): Set<string> {
    const existing = this.released.get(workspaceId);
    if (existing) return existing;
    const created = new Set<string>();
    this.released.set(workspaceId, created);
    return created;
  }
}
