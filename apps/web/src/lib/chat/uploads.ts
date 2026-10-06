import type { UploadView } from "@asi/contracts";
import type { GatewayClient } from "../gateway/client.ts";
const wait = (signal: AbortSignal, milliseconds: number) => new Promise<void>((resolve, reject) => {
  const aborted = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); reject(new DOMException("Upload cancelled", "AbortError")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, milliseconds);
  signal.addEventListener("abort", aborted, { once: true }); if (signal.aborted) aborted();
});
export async function awaitUpload(client: Pick<GatewayClient, "getUpload">, initial: UploadView, signal: AbortSignal, update: (view: UploadView) => void, attempts = 12, delayMs = 250): Promise<UploadView> {
  let view = initial;
  for (let attempt = 0; attempt < attempts && ["pending", "uploading", "scanning"].includes(view.status); attempt++) {
    if (signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
    if (attempt > 0) await wait(signal, delayMs);
    view = await client.getUpload(initial.uploadId, signal);
    if (view.uploadId !== initial.uploadId) throw new Error("Upload ownership mismatch");
    update(view);
  }
  return ["pending", "uploading", "scanning"].includes(view.status) ? { ...view, reason: "Scanning is still pending. Remove this upload and retry later; it is not authorized for sending." } : view;
}
