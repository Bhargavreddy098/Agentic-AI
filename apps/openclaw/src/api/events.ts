// SSE replay boundary for the OpenClaw-derived frontend.
//
// `readAsiEvents` is the single consumer of the ASI conversation event stream.
// It owns framing across split UTF-8 and newline boundaries, duplicate
// suppression, gap detection and conversation isolation. It never trusts a
// frame because the connection is authenticated: every frame must validate
// against the shared UiEvent contract before it can advance replay state.

import { UiEventSchema, type UiEvent } from "@asi/contracts";
import { TransportFailure } from "./http.ts";

/** Mutable replay cursor owned by the connection store, not the transport. */
export interface ReplayController {
  conversationId: string;
  lastSequence: number;
}

export interface ReplayOptions {
  /**
   * Invoked exactly once per detected gap, before the post-gap event is
   * delivered. Callers must treat the gap as a request to refetch the
   * authoritative snapshot; the transport itself never fabricates the
   * missing events.
   */
  onGap?: (expectedSequence: number, receivedSequence: number) => void;
}

const MAX_FRAME_SIZE = 2 * 1024 * 1024;

function parseFrame(frame: string): UiEvent {
  const data = frame
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n");

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new TransportFailure(502, "The conversation stream sent an unreadable frame.");
  }

  const parsed = UiEventSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TransportFailure(502, "The conversation stream sent a malformed projection.");
  }
  return parsed.data;
}

/**
 * Consume an SSE response as a stream of validated UiEvents.
 *
 * Contract proven by tests/openclaw/events.test.ts:
 * - split multi-byte UTF-8 codepoints are reassembled, never corrupted;
 * - a duplicate sequence never advances replay state twice;
 * - a sequence gap invokes onGap exactly once with (expected, received) and
 *   still delivers the post-gap event so callers can resynchronize;
 * - an event belonging to another conversation is discarded without touching
 *   the replay cursor;
 * - abort ends the iteration cleanly;
 * - a malformed frame, a wrong content type or an oversized frame rejects
 *   before any later frame can publish.
 */
export async function* readAsiEvents(
  response: Response,
  signal: AbortSignal,
  controller: ReplayController,
  options: ReplayOptions,
): AsyncGenerator<UiEvent> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("text/event-stream")) {
    throw new TransportFailure(response.status, "The conversation stream has an invalid content type.");
  }
  if (!response.body) {
    throw new TransportFailure(response.status, "The conversation stream has no body.");
  }

  const reader = response.body.getReader();
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const chunk = await reader.read();
      if (signal.aborted) return;

      if (chunk.done) {
        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          throw new TransportFailure(502, "The conversation stream ended with an incomplete frame.");
        }
        return;
      }

      // Streaming decode: a multi-byte codepoint split across chunks is held
      // back until the continuation bytes arrive.
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > MAX_FRAME_SIZE) {
        throw new TransportFailure(502, "A conversation stream frame exceeds its size limit.");
      }

      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);

        if (frame.trim().length > 0) {
          const event = parseFrame(frame);

          // Isolation: an event projected for another conversation never
          // publishes here and never moves the replay cursor.
          if (event.conversationId === controller.conversationId) {
            if (event.sequence > controller.lastSequence) {
              if (event.sequence > controller.lastSequence + 1) {
                options.onGap?.(controller.lastSequence + 1, event.sequence);
              }
              controller.lastSequence = event.sequence;
              yield event;
            }
            // sequence <= lastSequence: replay duplicate, drop silently.
          }
        }

        boundary = /\r?\n\r?\n/.exec(buffer);
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}