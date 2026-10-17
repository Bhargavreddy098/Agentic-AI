"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Textarea } from "@asi/ui";
import type { WorkspaceSession, UploadView } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client.ts";
import { SubmissionController } from "../../lib/chat/submission.ts";
import { awaitUpload } from "../../lib/chat/uploads.ts";

type Attachment = { key: string; name: string; view: UploadView; controller: AbortController };

export type WelcomeComposerProps = {
  client: GatewayClient;
  session: WorkspaceSession | null;
  submissionFor: (conversationId: string) => SubmissionController;
  onConversationCreated: (conversationId: string, remainingDraft: string) => void | Promise<void>;
};

export default function WelcomeComposer({ client, session, submissionFor, onConversationCreated }: WelcomeComposerProps) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const accepted = useRef<{ conversationId: string; text: string } | null>(null);
  const creationCommand = useRef<string | null>(null);
  const conversation = useRef<{ conversationId: string; revision: number } | null>(null);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const retry = conversation.current ? submissionFor(conversation.current.conversationId).pending : null;
  const uploadControllers = useRef(new Set<AbortController>());
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const uploadBusy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controllers = uploadControllers.current;
    return () => {
      mounted.current = false;
      controllers.forEach(c => c.abort());
    };
  }, []);

  const ready = attachments
    .filter(item => item.view.status === "ready" && item.view.attachmentId)
    .map(item => item.view.attachmentId!);
  const hasQuarantine = attachments.some(item => ["pending", "uploading", "scanning"].includes(item.view.status));
  const canSend = Boolean(session?.allowedActions.includes("chat")) &&
    !sending &&
    !hasQuarantine &&
    (Boolean(accepted.current) || Boolean(retry) || Boolean(draft.trim()) || ready.length > 0) &&
    new TextEncoder().encode(retry?.text ?? draft).length <= (session?.limits.maxMessageBytes ?? 32768);

  const send = async () => {
    if (!canSend || sendingRef.current || !session) return;
    sendingRef.current = true;
    setSending(true);
    setNotice(null);
    const openAccepted = async () => {
      if (!accepted.current || !mounted.current) return;
      setNavigating(true);
      const { conversationId, text } = accepted.current;
      await onConversationCreated(conversationId, latestDraft.current === text ? "" : latestDraft.current);
    };
    try {
      if (accepted.current) {
        await openAccepted();
        return;
      }
      creationCommand.current ??= crypto.randomUUID();
      conversation.current ??= await client.createConversation(creationCommand.current);
      if (!mounted.current) return;
      const current = conversation.current;
      const submission = submissionFor(current.conversationId);
      const text = submission.pending?.text ?? draft;
      const ids = submission.pending?.attachmentIds ?? ready;
      const result = await submission.submit(() => ({
        commandId: crypto.randomUUID(),
        clientMessageId: crypto.randomUUID(),
        expectedConversationRevision: current.revision,
        text: draft,
        attachmentIds: ready,
        requestedSkillIds: [],
      }));
      if (!mounted.current) return;
      if (result.status !== "applied") {
        setNotice(result.status === "approval_required"
          ? "Unexpected message decision response; refresh required."
          : result.error.safeMessage);
        return;
      }
      if (latestDraft.current === text) setDraft("");
      setAttachments(items => items.filter(item => !ids.includes(item.view.attachmentId ?? "")));
      accepted.current = { conversationId: current.conversationId, text };
      await openAccepted();
    } catch {
      if (mounted.current) {
        setNotice(accepted.current
          ? "Message accepted. Retry opening the conversation to keep your newer draft."
          : "Unable to start conversation. Please check connection and try again.");
      }
    } finally {
      sendingRef.current = false;
      if (mounted.current) { setSending(false); setNavigating(false); }
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files || uploadBusy.current || !session) return;
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
          setAttachments(items => items.map(item => item.key === key ? { ...item, view } : item));
        }
      };
      setAttachments(items => [...items, { key, name: file.name, controller: abort, view: { uploadId: key, status: "pending" } }]);
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

  return (
    <div className="chat-composer welcome-composer">
      <label className="sr-only" htmlFor="welcome-draft">Message</label>
      <Textarea
        id="welcome-draft"
        aria-label="Message"
        disabled={navigating}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder="Ask anything…"
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
          }
        }}
      />
      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map(item => (
            <div key={item.key} className="attachment-item">
              <span>{item.name} · {item.view.status}</span>
              {item.view.reason && <small>{item.view.reason}</small>}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${item.name}`}
                onClick={() => {
                  item.controller.abort();
                  setAttachments(items => items.filter(v => v.key !== item.key));
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="composer-actions">
        <div className="composer-left-actions">
          <label className="composer-attach-btn" htmlFor="welcome-file-upload" title="Attach files">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <input
              id="welcome-file-upload"
              ref={fileInput}
              aria-label="Attach files"
              type="file"
              multiple
              onChange={event => void upload(event.target.files)}
              disabled={uploading || !session?.allowedActions.includes("chat")}
              className="sr-only"
            />
          </label>
          <span className="capability-pill">Search ▾</span>
          <span className="capability-pill disabled" title="Computer control unavailable">Computer</span>
        </div>
        <div className="composer-right-actions">
          <span className="model-pill">Model ▾</span>
          <Button
            className={retry || accepted.current ? "composer-retry-btn" : "composer-send-btn"}
            disabled={!canSend}
            onClick={() => void send()}
          >
            <span className="send-arrow" aria-hidden="true">↑</span>
            <span className="send-label">{sending ? "Sending…" : accepted.current ? "Retry opening conversation" : retry ? "Retry prior message" : "Send"}</span>
          </Button>
        </div>
      </div>
      {notice && <p role="status" className="composer-notice">{notice}</p>}
    </div>
  );
}
