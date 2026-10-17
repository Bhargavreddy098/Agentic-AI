import { createHmac } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { createSlackAdapter, HttpChannelAdapter, type SlackEvent } from "@asi/channels";

const signingSecret = "test-signing-secret";

function createTestEvent(overrides: Partial<SlackEvent> = {}): SlackEvent {
  return {
    type: "event_callback",
    event_ts: "1234567890.123456",
    team_id: "T123456",
    event: {
      type: "message",
      channel: "C123456",
      user: "U123456",
      text: "Hello world",
      ts: "1234567890.123456",
    },
    ...overrides,
  };
}

function createValidPayload(
  event: SlackEvent,
  secret: string = signingSecret,
  timestamp: string = Math.floor(Date.now() / 1000).toString()
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(event);
  const basestring = `v0:${timestamp}:${body}`;
  const signature = "v0=" + createHmac("sha256", secret).update(basestring).digest("hex");

  return {
    body,
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
  };
}

describe("Slack Adapter", () => {
  let adapter: ReturnType<typeof createSlackAdapter>;
  const signingSecret = "test-signing-secret";

  beforeAll(() => {
    adapter = createSlackAdapter({
      name: "slack",
      signingSecret,
      botToken: "xoxb-test-token",
      maxInputSize: 1024 * 1024,
      timeoutMs: 5000,
    });
  });

  describe("Signature Verification", () => {
    it("should accept valid Slack signature", async () => {
      const event = createTestEvent();
      const payload = createValidPayload(event);
      const result = await adapter.normalize(payload);
      expect(result.event).toBeDefined();
      expect(result.event).not.toBeNull();
      expect(result.principal).toBeDefined();
      expect(result.principal).not.toBeNull();
    });

    it("rejects malformed request envelopes", async () => {
      await expect(adapter.normalize(null)).rejects.toThrow();
    });

    it("still rejects signed events with invalid event timestamps", async () => {
      const payload = createValidPayload(createTestEvent({ event_ts: "invalid-timestamp" }));
      await expect(adapter.normalize(payload)).rejects.toThrow(RangeError);
    });

    it("should reject invalid signature", async () => {
      const event = createTestEvent();
      const payload = {
        body: JSON.stringify(event),
        headers: {
          "x-slack-request-timestamp": Math.floor(Date.now() / 1000).toString(),
          "x-slack-signature": "v0=invalid",
        },
      };
      const result = await adapter.normalize(payload);
      expect(result.event).toBeNull();
    });

    it.each(["a", "aa", "a".repeat(63), "a".repeat(66)])(
      "rejects wrong-length hex signatures without throwing: %s",
      async signature => {
        const isolated = createSlackAdapter({ signingSecret, botToken: "xoxb-test" });
        const payload = createValidPayload(createTestEvent());
        payload.headers["x-slack-signature"] = "v0=" + signature;
        await expect(isolated.normalize(payload)).resolves.toEqual({ event: null, principal: null });
        expect(isolated.getThreadId("C123456")).toBeUndefined();
      }
    );

    it.each(["not-a-timestamp", "Infinity", "9007199254740992"])(
      "rejects a correctly signed malformed request timestamp: %s",
      async timestamp => {
        const isolated = createSlackAdapter({ signingSecret, botToken: "xoxb-test" });
        const payload = createValidPayload(createTestEvent(), signingSecret, timestamp);
        expect(await isolated.normalize(payload)).toEqual({ event: null, principal: null });
        expect(isolated.getThreadId("C123456")).toBeUndefined();
      }
    );

    it("rejects a signed request timestamp with trailing nonnumeric text", async () => {
      const isolated = createSlackAdapter({ signingSecret, botToken: "xoxb-test" });
      const timestamp = Math.floor(Date.now() / 1000).toString() + "junk";
      const payload = createValidPayload(createTestEvent(), signingSecret, timestamp);
      expect(await isolated.normalize(payload)).toEqual({ event: null, principal: null });
      expect(isolated.getThreadId("C123456")).toBeUndefined();
    });

    it("should reject stale requests (timestamp > 5 minutes)", async () => {
      const adapter = createSlackAdapter({
        name: "slack",
        signingSecret: "test-secret",
        botToken: "xoxb-test",
      });

      const event = createTestEvent({ event_ts: "1234567890.123456" });
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
      const payload = createValidPayload(event, "test-secret", oldTimestamp);

      const result = await adapter.normalize(payload);
      expect(result.event).toBeNull();
    });
  });

  describe("Event Normalization", () => {
    it("should skip bot messages", async () => {
      const adapter = createSlackAdapter({
        name: "slack",
        signingSecret: "test",
        botToken: "xoxb-test",
      });

      const event = createTestEvent({
        event: {
          type: "message",
          channel: "C123456",
          user: "U123456",
          text: "Bot message",
          ts: "1234567890.123",
          bot_id: "B123456",
        },
      });

      const payload = createValidPayload(event, "test");

      const result = await adapter.normalize(payload);
      expect(result.event).toBeNull();
    });

    it("should deduplicate events", async () => {
      const adapter = createSlackAdapter({
        name: "slack",
        signingSecret: "test",
        botToken: "xoxb-test",
      });

      const event = createTestEvent({
        event: {
          type: "message",
          channel: "C123456",
          user: "U123456",
          text: "Dedupe test",
          ts: "1234567890.123",
        },
      });

      const payload = createValidPayload(event, "test");
      const result1 = await adapter.normalize(payload);
      const result2 = await adapter.normalize(payload);
      expect(result1.event).not.toBeNull();
      expect(result2.event).toBeNull();
    });
  });

  describe("Thread Identity", () => {
    it("should track thread identity with thread_ts", async () => {
      const adapter = createSlackAdapter({
        name: "slack",
        signingSecret: "test",
        botToken: "xoxb-test",
      });

      const event = createTestEvent({
        event_ts: "1234567890.123456",
        team_id: "T123456",
        event: {
          type: "message",
          channel: "C123456",
          user: "U123456",
          text: "Thread start",
          ts: "1234567890.123",
          thread_ts: "1234567890.123",
        },
      });

      const payload = createValidPayload(event, "test");

      await adapter.normalize(payload);

      const threadId = adapter.getThreadId("C123456");
      expect(threadId).toBe("1234567890.123");
    });

    it("should use message ts as thread id when no thread_ts", async () => {
      const adapter = createSlackAdapter({
        name: "slack",
        signingSecret: "test",
        botToken: "xoxb-test",
      });

      const event = createTestEvent({
        event: {
          type: "message",
          channel: "C123456",
          user: "U123456",
          text: "No thread",
          ts: "1234567890.456",
        },
      });

      const payload = createValidPayload(event, "test");

      await adapter.normalize(payload);

      const threadId = adapter.getThreadId("C123456");
      expect(threadId).toBe("1234567890.456");
    });
  });

  describe("Message Sending", () => {
    it("should send messages", async () => {
      const adapter = createSlackAdapter({
        name: "slack",
        signingSecret: "test",
        botToken: "xoxb-test",
      });

      const result = await adapter.sendMessage({
        channel: "C123456",
        text: "Hello world",
      });

      expect(result.ts).toBeDefined();
      expect(result.channel).toBe("C123456");
    });

    it("should send thread replies", async () => {
      const adapter = createSlackAdapter({
        name: "slack",
        signingSecret: "test",
        botToken: "xoxb-test",
      });

      const result = await adapter.sendThreadReply("C123456", "1234567890.123", "Thread reply");
      expect(result.ts).toBeDefined();
    });
  });
});

describe("HTTP channel principal validation", () => {
  it("preserves a valid HTTP task and principal", async () => {
    const adapter = new HttpChannelAdapter({
      name: "http",
      endpoint: "https://example.test/events",
      maxInputSize: 1024,
      timeoutMs: 5000,
    });
    const task = { type: "message", text: "Hello" };
    const principal = {
      tenantId: "tenant-1",
      subjectId: "subject-1",
      roles: ["user"],
      capabilities: ["chat:read"],
      audience: "http",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "http",
    };

    expect(await adapter.normalize({ task, principal })).toEqual({ event: task, principal });
  });

  it("rejects malformed principals from HTTP JSON", async () => {
    const adapter = new HttpChannelAdapter({
      name: "http",
      endpoint: "https://example.test/events",
      maxInputSize: 1024,
      timeoutMs: 5000,
    });

    await expect(adapter.normalize({
      task: { type: "message", text: "Hello" },
      principal: { tenantId: "tenant-1" },
    })).rejects.toThrow();
  });
});
