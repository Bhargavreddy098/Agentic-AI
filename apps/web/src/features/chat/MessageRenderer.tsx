"use client";
import { memo } from "react";
import type { UiMessage } from "@asi/contracts";
import SafeMarkdown, { safeHttpUrl } from "./SafeMarkdown";
import { formatRelativeTime } from "../../lib/utils/date";

type UiMessagePart = UiMessage["parts"][number];

const roleLabels: Record<UiMessage["role"], string> = { user: "You", assistant: "Assistant", "system-notice": "Notice" };

function Part({ part }: { part: UiMessagePart }) {
  if (part.type === "text") return <SafeMarkdown text={part.text} />;
  if (part.type === "citation") {
    const href = safeHttpUrl(part.url);
    return href ? <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">{part.title}</a> : <span className="message-reference">{part.title}</span>;
  }
  if (part.type === "status-summary") return <p className="message-status-summary">{part.summary}</p>;
  return <span className="message-reference" data-reference-type={part.type}>{part.type.replace("-reference", "")}: {part.referenceId}</span>;
}

export const MessageRenderer = memo(function MessageRenderer({ message }: { message: UiMessage }) {
  return <article className="chat-message" data-testid={`message-${message.messageId}`} data-role={message.role}>
    <div className="message-meta"><strong>{roleLabels[message.role]}</strong><time dateTime={message.createdAt}>{formatRelativeTime(message.createdAt)}</time></div>
    {message.parts.map(part => <Part key={part.partId} part={part} />)}
  </article>;
});
MessageRenderer.displayName = "MessageRenderer";
