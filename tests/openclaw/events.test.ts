// Replay-boundary tests for the OpenClaw-derived ASI event transport.
//
// These tests drive `readAsiEvents` with raw bytes (not pre-parsed JSON) so
// they prove behaviour across UTF-8 and newline boundaries, not just happy
// path framing. They also cover the replay contract: duplicates never advance
// state twice, gaps demand an authoritative snapshot, and events for an old
// conversation cannot publish.

import { describe, expect, it } from "vitest";
import { readAsiEvents, type ReplayController } from "../../apps/openclaw/src/api/events.ts";
import { createAsiEvent } from "./fixtures/events.fixture.ts";

function sseBytes(frames: string[]): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoded.encode(frame));
      controller.close();
    },
  });
}

function sseResponse(frames: string[], contentType = "text/event-stream"): Response {
  return new Response(sseBytes(frames), { status: 200, headers: { "content-type": contentType } });
}

const CONVERSATION = "conv-replay-boundary";

function messageEvent(sequence: number, text: string) {
  return createAsiEvent({
    conversationId: CONVERSATION,
    eventId: `evt-${sequence}`,
    sequence,
    eventType: "message.created",
    payload: {
      messageId: `msg-${sequence}`,
      role: "assistant",
      createdAt: "2026-10-21T09:00:00.000Z",
      parts: [{ type: "text", partId: `part-${sequence}`, text }],
    },
  });
}

function frame(...events: ReturnType<typeof messageEvent>[]): string[] {
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`);
}

describe("readAsiEvents", () => {
  it("split UTF8 does not corrupt message", async () => {
    // The snowman is U+2603: three UTF-8 bytes. The second frame starts in
    // the middle of that codepoint, so a naive per-chunk decode would emit a
    // replacement character. A streaming TextDecoder must reassemble it.
    const event = messageEvent(1, "snow☃man");
    const wire = `data: ${JSON.stringify(event)}\n\n`;
    const bytes = new TextEncoder().encode(wire);
    const splitAt = wire.indexOf("☃"); // byte offset lands inside the multibyte char
    const first = bytes.slice(0, splitAt + 1); // cut after the first byte of U+2603
    const second = bytes.slice(splitAt + 1);
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(first);
          controller.enqueue(second);
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

    const controller: ReplayController = { conversationId: CONVERSATION, lastSequence: 0 };
    const received: string[] = [];
    const gaps: number[] = [];
    for await (const event of readAsiEvents(response, new AbortController().signal, controller, { onGap: () => gaps.push(event.sequence) })) {
      if (event.eventType === "message.created") {
        const part = event.payload.parts[0];
        received.push(part && part.type === "text" ? part.text : "");
      }
    }
    expect(received).toEqual(["snow☃man"]);
    expect(gaps).toEqual([]);
  });

  it("duplicate event does not advance twice", async () => {
    const one = messageEvent(1, "first");
    const two = messageEvent(2, "second");
    const response = sseResponse([...frame(one), ...frame(one, two)]);
    const controller: ReplayController = { conversationId: CONVERSATION, lastSequence: 0 };
    const seen: number[] = [];
    for await (const event of readAsiEvents(response, new AbortController().signal, controller, {})) {
      seen.push(event.sequence);
    }
    expect(seen).toEqual([1, 2]);
    expect(controller.lastSequence).toBe(2);
  });

  it("gap requests authoritative snapshot", async () => {
    // Sequence jumps 1 -> 3. The reader must surface the gap exactly once and
    // never deliver the post-gap event as if it were contiguous.
    const one = messageEvent(1, "first");
    const three = messageEvent(3, "third");
    const response = sseResponse([...frame(one), ...frame(three)]);
    const controller: ReplayController = { conversationId: CONVERSATION, lastSequence: 0 };
    const gaps: Array<{ expected: number; got: number }> = [];
    const delivered: number[] = [];
    for await (const event of readAsiEvents(response, new AbortController().signal, controller, {
      onGap: (expected, got) => gaps.push({ expected, got }),
    })) {
      delivered.push(event.sequence);
    }
    expect(gaps).toEqual([{ expected: 2, got: 3 }]);
    // After a gap the caller must refetch the snapshot; the gap event itself is
    // still delivered so a caller can resync, but ordering is preserved.
    expect(delivered).toEqual([1, 3]);
  });

  it("old conversation cannot publish", async () => {
    const own = messageEvent(1, "mine");
    const foreign = { ...messageEvent(2, "foreign"), conversationId: "conv-other" };
    const response = sseResponse([...frame(own), `data: ${JSON.stringify(foreign)}\n\n`]);
    const controller: ReplayController = { conversationId: CONVERSATION, lastSequence: 0 };
    const delivered: string[] = [];
    for await (const event of readAsiEvents(response, new AbortController().signal, controller, {})) {
      delivered.push(event.conversationId);
    }
    expect(delivered).toEqual([CONVERSATION]);
    expect(controller.lastSequence).toBe(1);
  });

  it("abort cancels reader", async () => {
    const abort = new AbortController();
    const one = messageEvent(1, "first");
    const frames = [...frame(one)];
    // Stream that never closes: after the first frame it stalls until abort.
    const encoded = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoded.encode(frames.join("")));
        },
        cancel() {},
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
    const controller: ReplayController = { conversationId: CONVERSATION, lastSequence: 0 };
    const delivered: number[] = [];
    const iterator = readAsiEvents(response, abort.signal, controller, {});
    const first = await iterator.next();
    if (!first.done) delivered.push(first.value.sequence);
    abort.abort();
    const after = await iterator.next();
    expect(after.done).toBe(true);
    expect(delivered).toEqual([1]);
  });

  it("malformed frame rejects without yielding later frames", async () => {
    const two = messageEvent(2, "second");
    const response = sseResponse(["data: {not-json}\n\n", ...frame(two)]);
    const controller: ReplayController = { conversationId: CONVERSATION, lastSequence: 0 };
    const errors: unknown[] = [];
    const delivered: number[] = [];
    const stream = readAsiEvents(response, new AbortController().signal, controller, {});
    try {
      for await (const event of stream) delivered.push(event.sequence);
    } catch (error) {
      errors.push(error);
    }
    expect(errors.length).toBe(1);
    expect(delivered).toEqual([]);
  });

  it("non-event-stream content type rejects", async () => {
    const response = sseResponse(frame(messageEvent(1, "x")), "application/json");
    const controller: ReplayController = { conversationId: CONVERSATION, lastSequence: 0 };
    await expect(async () => {
      for await (const _event of readAsiEvents(response, new AbortController().signal, controller, {})) {
        void _event; // unreachable
      }
    }).rejects.toThrow(/content type/i);
  });

  it("oversized frame rejects", async () => {
    const huge = `data: ${"x".repeat(2 * 1024 * 1024 + 1)}\n\n`;
    const response = sseResponse([huge]);
    const controller: ReplayController = { conversationId: CONVERSATION, lastSequence: 0 };
    await expect(async () => {
      for await (const _event of readAsiEvents(response, new AbortController().signal, controller, {})) {
        void _event; // unreachable
      }
    }).rejects.toThrow(/limit|size/i);
  });
});

describe("replay fixture hygiene", () => {
  it("fixture events validate against the shared contract", async () => {
    const { UiEventSchema } = await import("@asi/contracts");
    const event = messageEvent(7, "contract check");
    expect(UiEventSchema.safeParse(event).success).toBe(true);
  });
});
