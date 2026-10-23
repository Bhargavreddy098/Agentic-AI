"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Renderer } from "@openuidev/react-lang";
import { Button } from "@/components/motion/button/base";
import { beuiLibrary } from "@/lib/beui-library";

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
  error?: string;
};

const SUGGESTIONS = [
  "Show the qualified stages as a dashboard",
  "Summarize the provider status",
  "What is blocking stage 07?",
];

function autosize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
}

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const patchTurn = useCallback(
    (id: string, patch: Partial<Turn>) => {
      setTurns((prev) =>
        prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)),
      );
    },
    [],
  );

  const appendDelta = useCallback((id: string, chunk: string) => {
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === id ? { ...turn, content: turn.content + chunk } : turn,
      ),
    );
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;

      const history = turns
        .filter((turn) => turn.content.length > 0)
        .slice(-20)
        .map((turn) => ({ role: turn.role, content: turn.content }));

      const userTurn: Turn = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        streaming: false,
      };
      const assistantId = crypto.randomUUID();

      setTurns((prev) => [
        ...prev,
        userTurn,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          streaming: true,
        },
      ]);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          patchTurn(assistantId, {
            streaming: false,
            error:
              payload?.error ??
              "The stream did not open. Check the model configuration.",
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                content?: string;
              };
              if (event.type === "delta" && event.content) {
                appendDelta(assistantId, event.content);
              }
              if (event.type === "error") {
                patchTurn(assistantId, {
                  error: event.content ?? "The model stream failed.",
                });
              }
            } catch {
              // ignore malformed frames
            }
          }
        }
        patchTurn(assistantId, { streaming: false });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          patchTurn(assistantId, {
            streaming: false,
            error: "The stream dropped. Send the message again.",
          });
        } else {
          patchTurn(assistantId, { streaming: false });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        textareaRef.current?.focus();
      }
    },
    [turns, streaming, appendDelta, patchTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-8">
          {turns.length === 0 ? (
            <div className="flex flex-col items-start gap-6 pt-14">
              <p className="font-mono text-xs text-muted-foreground">
                generated interfaces · registered beUI components only
              </p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
                Ask for an interface.
              </h2>
              <p className="max-w-md text-[15px] leading-7 text-foreground/70">
                The model replies in OpenUI Lang. Every node maps to a beUI
                component registered in this app, so the answer arrives as a
                real React interface instead of Markdown.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="secondary"
                    size="sm"
                    onClick={() => void send(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div key={turn.id} className="chat-enter flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm border border-border bg-card px-4 py-2.5 text-[15px] leading-6 text-foreground shadow-xs">
                      {turn.content}
                    </div>
                  </div>
                ) : (
                  <div key={turn.id} className="chat-enter flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-xs font-semibold text-primary-foreground">
                      A
                    </span>
                    <div className="min-w-0 flex-1 space-y-3 pt-0.5">
                      {turn.content.length > 0 ? (
                        <Renderer
                          response={turn.content}
                          library={beuiLibrary}
                          isStreaming={turn.streaming}
                          onAction={(event) => {
                            if (event.humanFriendlyMessage) {
                              void send(event.humanFriendlyMessage);
                            }
                          }}
                        />
                      ) : turn.streaming ? (
                        <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                          <span className="caret" />
                          composing interface
                        </p>
                      ) : null}
                      {turn.error ? (
                        <p
                          role="alert"
                          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm leading-6 text-destructive"
                        >
                          {turn.error}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 lg:px-8">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="rounded-xl border border-border bg-card shadow-xs transition-colors focus-within:border-primary/40"
          >
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              placeholder="Describe the interface you want"
              aria-label="Message the console"
              onChange={(event) => {
                setInput(event.target.value);
                autosize(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              className="min-h-[52px] w-full resize-none overflow-y-auto bg-transparent px-4 pt-3.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between px-4 pb-3">
              <p className="font-mono text-[11px] text-muted-foreground">
                enter to send · shift+enter for a new line
              </p>
              {streaming ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={stop}
                  aria-label="Stop generating"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                    <rect x="2" y="2" width="8" height="8" rx="1" />
                  </svg>
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim()}
                  aria-label="Send message"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]"
                  >
                    <path
                      d="M8 13V3M4 7l4-4 4 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
