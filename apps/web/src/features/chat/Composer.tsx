"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Monitor, Plus, Search } from "lucide-react";
import { Button, Textarea } from "@asi/ui";
import type { ConversationSnapshot, WorkspaceSession, UploadView, UiCommandResult } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client.ts";
import { SubmissionController } from "../../lib/chat/submission.ts";
import { awaitUpload } from "../../lib/chat/uploads.ts";

type Attachment = { key: string; name: string; view: UploadView; controller: AbortController };
export type ComposerProps = {
  client: GatewayClient;
  snapshot: ConversationSnapshot;
  session: WorkspaceSession;
  draft: string;
  submission: SubmissionController;
  onCancel: (runId: string) => Promise<UiCommandResult>;
  onDraft: (draft: string) => void;
  onRefresh: () => Promise<void>;
  onCreateAndSend?: (input: { text: string; attachmentIds: string[] }) => Promise<UiCommandResult>;
};

export default function Composer({
  client,
  snapshot,
  session,
  draft,
  submission,
  onCancel,
  onDraft,
  onRefresh,
  onCreateAndSend,
}: ComposerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const sendingRef = useRef(false);
  const uploadControllers = useRef(new Set<AbortController>());
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const uploadBusy = useRef(false);
  const mounted = useRef(true);
  const cancelBusy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    const controllers = uploadControllers.current;
    return () => {
      mounted.current = false;
      controllers.forEach(controller => controller.abort());
    };
  }, []);

  const active =
    snapshot.runStatus !== null &&
    !["completed", "failed", "cancelled", "budget_exhausted"].includes(snapshot.runStatus);
  const retry = submission.pending;
  const ready = attachments
    .filter(item => item.view.status === "ready" && item.view.attachmentId)
    .map(item => item.view.attachmentId!);
  const hasQuarantine = attachments.some(item =>
    ["pending", "uploading", "scanning"].includes(item.view.status),
  );
  const canSend =
    session.allowedActions.includes("chat") &&
    snapshot.composerCapabilities.includes("send") &&
    (!active || Boolean(retry)) &&
    (Boolean(retry) || snapshot.revision >= submission.confirmedRevision) &&
    !sending &&
    !hasQuarantine &&
    (Boolean(retry) || Boolean(draft.trim()) || ready.length > 0) &&
    new TextEncoder().encode(retry?.text ?? draft).length <= session.limits.maxMessageBytes;

  const send = async () => {
    if (!canSend || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setNotice(null);
    const text = retry?.text ?? draft;
    const ids = retry?.attachmentIds ?? ready;
    try {
      const result = onCreateAndSend
        ? await onCreateAndSend({ text: draft, attachmentIds: ready })
        : await submission.submit(() => ({
            commandId: crypto.randomUUID(),
            clientMessageId: crypto.randomUUID(),
            expectedConversationRevision: snapshot.revision,
            text: draft,
            attachmentIds: ready,
            requestedSkillIds: [],
          }));
      if (!mounted.current) return;
      if (result.status === "applied") {
        if (latestDraft.current === text) onDraft("");
        setAttachments(items => items.filter(item => !ids.includes(item.view.attachmentId ?? "")));
        setNotice("Message accepted by Gateway.");
      } else {
        setNotice(
          result.status === "approval_required"
            ? "Unexpected message decision response; refresh required."
            : result.error.safeMessage,
        );
        await onRefresh();
      }
    } catch {
      if (mounted.current) {
        setNotice("Response unavailable. Retry the prior message with the same command identity.");
      }
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files || uploadBusy.current) return;
    const selected = [...files];
    if (attachments.length + selected.length > session.limits.maxAttachmentCount) {
      setNotice("Attachment count exceeds the workspace limit.");
      return;
    }
    uploadBusy.current = true;
    setUploading(true);
    for (const file of selected) {
      if (!mounted.current) break;
      if (file.size > session.limits.maxAttachmentBytes) {
        setNotice(`${file.name}: attachment exceeds the workspace limit.`);
        continue;
      }
      const key = crypto.randomUUID();
      const abort = new AbortController();
      uploadControllers.current.add(abort);
      const update = (view: UploadView) => {
        if (!abort.signal.aborted) {
          setAttachments(items => items.map(item => (item.key === key ? { ...item, view } : item)));
        }
      };
      setAttachments(items => [
        ...items,
        { key, name: file.name, controller: abort, view: { uploadId: key, status: "pending" } },
      ]);
      try {
        const view = await client.beginUpload({
          commandId: key,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          byteSize: file.size,
        });
        update(view);
        if (view.status === "rejected" || abort.signal.aborted) continue;
        await client.uploadContent(view.uploadId, file, abort.signal);
        update({ ...view, status: "scanning" });
        const completed = await client.completeUpload(view.uploadId, crypto.randomUUID());
        update(completed);
        update(await awaitUpload(client, completed, abort.signal, update));
      } catch {
        update({ uploadId: key, status: "rejected", reason: "Upload unavailable; remove it and try again." });
      } finally {
        uploadControllers.current.delete(abort);
      }
    }
    uploadBusy.current = false;
    if (mounted.current) setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const cancel = async () => {
    if (!snapshot.activeRunId || cancelBusy.current) return;
    cancelBusy.current = true;
    setCancelling(true);
    try {
      const result = await onCancel(snapshot.activeRunId);
      if (mounted.current) {
        setNotice(
          result.status === "applied"
            ? "Cancellation requested; awaiting the run event."
            : "Cancellation unavailable; refresh the run state.",
        );
      }
    } catch {
      if (mounted.current) setNotice("Cancellation response unavailable; refresh before retrying.");
    } finally {
      if (mounted.current) {
        try {
          await onRefresh();
        } catch {
          if (mounted.current) setNotice("Run refresh unavailable; no cancellation outcome is assumed.");
        }
      }
      cancelBusy.current = false;
      if (mounted.current) setCancelling(false);
    }
  };

  return (
    <div className="chat-composer">
      <label className="sr-only" htmlFor="chat-draft">
        Message
      </label>
      <Textarea
        id="chat-draft"
        value={draft}
        onChange={event => onDraft(event.target.value)}
        placeholder="Ask anything..."
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
          }
        }}
      />
      {attachments.length > 0 ? (
        <div className="attachment-list">
          {attachments.map(item => (
            <div key={item.key} className="attachment-chip">
              <span>
                {item.name} · {item.view.status}
              </span>
              {item.view.reason ? <small>{item.view.reason}</small> : null}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${item.name}`}
                onClick={() => {
                  item.controller.abort();
                  setAttachments(items => items.filter(value => value.key !== item.key));
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="composer-actions">
        <div className="composer-toolbar-left">
          <label
            htmlFor="chat-attach-input"
            className={`composer-attach-btn ${uploading || !session.allowedActions.includes("chat") ? "is-disabled" : ""}`}
            title="Attach files"
          >
            <Plus className="size-4" aria-hidden="true" />
          </label>
          <input
            id="chat-attach-input"
            ref={fileInput}
            className="sr-only"
            aria-label="Attach files"
            type="file"
            multiple
            onChange={event => void upload(event.target.files)}
            disabled={uploading || !session.allowedActions.includes("chat")}
          />
          <div className="composer-mode-group" aria-hidden="true">
            <span className="composer-mode-pill is-active">
              <Search className="size-3.5" />
              <span>Search</span>
              <ChevronDown className="size-3" />
            </span>
            <span className="composer-mode-pill is-muted" title="Sandbox execution requires a qualified host">
              <Monitor className="size-3.5" />
              <span>Computer</span>
            </span>
          </div>
        </div>
        <div className="composer-toolbar-right">
          <span className="composer-model-pill">
            <span>{snapshot.effectiveModel ?? "No effective model"}</span>
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </span>
          {active && snapshot.activeRunId && snapshot.composerCapabilities.includes("cancel") ? (
            <Button variant="outline" size="sm" className="composer-stop-btn" disabled={cancelling} onClick={() => void cancel()}>
              Stop
            </Button>
          ) : null}
          <Button
            className={retry ? "composer-retry-btn" : "composer-send-btn"}
            disabled={!canSend}
            onClick={() => void send()}
          >
            {retry ? (
              <span>Retry prior message</span>
            ) : (
              <>
                <ArrowUp className="size-4" aria-hidden="true" />
                <span className="sr-only">{sending ? "Sending…" : "Send"}</span>
              </>
            )}
          </Button>
        </div>
      </div>
      {notice ? (
        <p role="status" className="composer-notice">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
