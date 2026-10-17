import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UiMessageSchema } from "../../../packages/contracts/src/ui/index.js";
import { MessageRenderer } from "../../../apps/web/src/features/chat/MessageRenderer";
import { ConversationPanel } from "../../../apps/web/src/features/chat/ConversationPanel";
import SafeMarkdown, { safeHttpUrl } from "../../../apps/web/src/features/chat/SafeMarkdown";
import { renderMarkdown, sanitizeHtml } from "../../../apps/web/src/features/chat/markdown";
import { formatStatusSummary } from "../../../apps/web/src/features/chat/status-summary";

const createMessage = (overrides = {}) => UiMessageSchema.parse({
  messageId: "msg-1",
  role: "user",
  createdAt: "2024-01-01T12:00:00.000Z",
  parts: [{ type: "text", partId: "part-1", text: "Hello world" }],
  ...overrides
});
const createAssistantMessage = (overrides = {}) => UiMessageSchema.parse({
  messageId: "msg-2",
  role: "assistant",
  createdAt: "2024-01-01T12:00:01.000Z",
  parts: [{ type: "text", partId: "part-2", text: "Hello! How can I help?" }],
  ...overrides
});
afterEach(cleanup);

describe("MessageRenderer", () => {
  it("renders the canonical role of the message", () => {
    render(<MessageRenderer message={createMessage()} />);
    expect(screen.getByRole("article")).toHaveAttribute("data-role", "user");
    expect(screen.getByRole("article")).toHaveAttribute("data-testid", "message-msg-1");
    render(<MessageRenderer message={createAssistantMessage()} />);
    expect(screen.getAllByRole("article")[1]).toHaveAttribute("data-role", "assistant");
  });

  it("shows the timestamp in an accessible format", () => {
    render(<MessageRenderer message={createMessage()} />);
    expect(screen.getByRole("time")).toHaveAttribute("dateTime", "2024-01-01T12:00:00.000Z");
  });

  it("renders text parts through the qualified markdown wrapper", () => {
    render(<MessageRenderer message={createAssistantMessage({ parts: [{ type: "text", partId: "part-1", text: "Use **bold** and `const`" }] })} />);
    expect(screen.getByRole("article").querySelector(".safe-markdown strong")).toHaveTextContent("bold");
    expect(screen.getByRole("article").querySelector(".safe-markdown code")).toHaveTextContent("const");
  });

  it("renders citation parts as safe external links", () => {
    render(<MessageRenderer message={createAssistantMessage({ parts: [{ type: "citation", partId: "part-1", title: "Documentation", url: "https://example.com/docs" }] })} />);
    const link = screen.getByRole("link", { name: "Documentation" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders status-summary and reference parts without inventing payloads", () => {
    render(<MessageRenderer message={createAssistantMessage({ parts: [
      { type: "status-summary", partId: "part-1", summary: "Verification completed" },
      { type: "task-reference", partId: "part-2", referenceId: "task-1" },
      { type: "artifact-reference", partId: "part-3", referenceId: "artifact-1" }
    ] })} />);
    expect(screen.getByText("Verification completed")).toBeInTheDocument();
    expect(screen.getByText(/task: task-1/)).toBeInTheDocument();
    expect(screen.getByText(/artifact: artifact-1/)).toBeInTheDocument();
  });

  it("never injects raw scripts from message text", () => {
    render(<MessageRenderer message={createAssistantMessage({ parts: [{ type: "text", partId: "part-1", text: '<script>alert("xss")</script> Safe text' }] })} />);
    const article = screen.getByRole("article");
    expect(screen.getByText(/Safe text/)).toBeInTheDocument();
    expect(article.querySelector("script")).toBeNull();
    expect(article.innerHTML).not.toContain("<script>");
  });
});

describe("ConversationPanel", () => {
  const messages = [
    createMessage({ messageId: "1", parts: [{ type: "text", partId: "p1", text: "First message" }] }),
    createAssistantMessage({ messageId: "2", parts: [{ type: "text", partId: "p2", text: "First response" }] }),
    createMessage({ messageId: "3", parts: [{ type: "text", partId: "p3", text: "Second message" }] })
  ];

  it("renders canonical messages in order with stable keys", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ConversationPanel messages={messages} />);
    const items = screen.getAllByRole("article");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("First message");
    expect(items[1]).toHaveTextContent("First response");
    expect(items[2]).toHaveTextContent("Second message");
    expect(error.mock.calls.flat().join(" ")).not.toContain("unique");
    error.mockRestore();
  });

  it("exposes an accessible, live conversation log with bottom-follow control", () => {
    render(<ConversationPanel messages={messages} connection="connected" />);
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("connection-status")).toHaveTextContent("connected");
    expect(screen.getByRole("button", { name: /follow/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("surfaces the connection notice and empty state", () => {
    render(<ConversationPanel messages={messages} connection="disconnected" notice="Connection lost" />);
    expect(screen.getByTestId("connection-status")).toHaveTextContent("Connection lost");
    cleanup();
    render(<ConversationPanel messages={[]} />);
    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
  });
});

describe("SafeMarkdown", () => {
  it("renders safe http links and rejects unsafe schemes", () => {
    render(<SafeMarkdown text="[Docs](https://example.com) and [Bad](javascript:alert(1))" />);
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "https://example.com/");
    expect(screen.queryByRole("link", { name: "Bad" })).toBeNull();
  });

  it("validates URL safety independently", () => {
    expect(safeHttpUrl("https://example.com")).toBe("https://example.com/");
    expect(safeHttpUrl("http://user:pass@example.com")).toBeNull();
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("renders tables, lists and quotes as inert structured markup", () => {
    render(<SafeMarkdown text={"| Step | Status |\n| --- | --- |\n| Clarify | suspended |\n| Verify | completed |\n\n- first\n- second\n\n1. one\n\n> quoted"} />);
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Clarify");
    expect(table).toHaveTextContent("suspended");
    expect(table.querySelectorAll("th")).toHaveLength(2);
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("quoted")).toBeInTheDocument();
  });
});

describe("markdown utilities", () => {
  it("converts basic markdown and sanitizes dangerous HTML", () => {
    expect(renderMarkdown("# Header\n\n**bold**")).toContain("<h1>Header</h1>");
    const clean = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(clean).not.toContain("onerror");
    expect(clean).toContain("<img");
  });

  it("keeps links and code blocks safe and structured", () => {
    const html = renderMarkdown("Use `const` for constants\n\n```js\nconsole.log('hi');\n```\n\n[Link](https://example.com)");
    expect(html).toContain("<code");
    expect(html).toContain("console.log");
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain("rel=");
  });

  it("sanitizes scripts, handlers and javascript URLs", () => {
    expect(sanitizeHtml('<script>alert(1)</script><p>Safe</p>')).not.toContain("<script>");
    expect(sanitizeHtml('<div onclick="evil()">Content</div>')).not.toContain("onclick");
    expect(sanitizeHtml('<a href="javascript:alert(1)">Link</a>')).not.toContain("javascript:");
    expect(sanitizeHtml('<p><strong>Bold</strong> and <em>italic</em></p>')).toContain("<strong>");
  });
});

describe("status-summary", () => {
  it("formats run states into stable summaries", () => {
    expect(formatStatusSummary({ status: "running", progress: 0.5, currentStep: "Processing" }).text).toContain("50%");
    expect(formatStatusSummary({ status: "failed", error: "Timeout" })).toMatchObject({ variant: "error" });
    expect(formatStatusSummary({ status: "unknown" })).toMatchObject({ variant: "warning" });
    expect(formatStatusSummary({ status: "waiting_approval", approvalSummary: "Send message?" }).text).toContain("Send message?");
  });
});
