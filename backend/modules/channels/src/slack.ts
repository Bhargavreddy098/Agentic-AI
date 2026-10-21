import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import type { Principal } from "@asi/contracts";

export interface SlackConfig {
  name: string;
  maxInputSize: number;
  timeoutMs: number;
  signingSecret: string;
  botToken: string;
  appToken?: string;
}

// Existing callers may provide only credentials; optional limits are not currently enforced.
type SlackAdapterConfig = Pick<SlackConfig, "signingSecret" | "botToken"> &
  Partial<Omit<SlackConfig, "signingSecret" | "botToken">>;

export interface SlackEvent {
  type: string;
  event_ts: string;
  team_id: string;
  event: SlackEventPayload;
}

interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  url_private_download?: string;
}

export interface SlackEventPayload {
  type: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  // These Slack payloads are opaque here; only files are inspected by normalization.
  blocks?: unknown[];
  attachments?: unknown[];
  files?: SlackFile[];
}

interface SlackRequest {
  body: string;
  headers: Record<string, string>;
}

type ParsedSlackEvent = SlackEvent & { principal?: unknown };
type SlackNormalizationResult =
  | { event: ParsedSlackEvent & { principal: Principal }; principal: Principal }
  | { event: null; principal: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSlackRequest(value: unknown): value is SlackRequest {
  return isRecord(value) && typeof value.body === "string" &&
    isRecord(value.headers) && Object.values(value.headers).every(header => typeof header === "string");
}

function isSlackFile(value: unknown): value is SlackFile {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.mimetype === "string" && typeof value.size === "number" &&
    (value.url_private_download === undefined || typeof value.url_private_download === "string");
}

function isSlackEvent(value: unknown): value is ParsedSlackEvent {
  if (!isRecord(value) || typeof value.type !== "string" ||
    typeof value.event_ts !== "string" || typeof value.team_id !== "string" || !isRecord(value.event)) {
    return false;
  }
  const event = value.event;
  return typeof event.type === "string" && typeof event.channel === "string" &&
    typeof event.user === "string" && typeof event.text === "string" && typeof event.ts === "string" &&
    (event.thread_ts === undefined || typeof event.thread_ts === "string") &&
    (event.bot_id === undefined || typeof event.bot_id === "string") &&
    (event.blocks === undefined || Array.isArray(event.blocks)) &&
    (event.attachments === undefined || Array.isArray(event.attachments)) &&
    (event.files === undefined || (Array.isArray(event.files) && event.files.every(isSlackFile)));
}

export class SlackAdapter {
  private config: SlackAdapterConfig;
  private processedEvents: Set<string> = new Set();
  private threadMap: Map<string, string> = new Map();

  constructor(config: SlackAdapterConfig) {
    this.config = { ...config, name: "slack" };
  }

  async normalize(input: unknown): Promise<SlackNormalizationResult> {
    if (!isSlackRequest(input)) {
      throw new Error("Invalid Slack request");
    }
    const payload = input;

    if (!this.verifySignature(payload)) {
      return { event: null, principal: null };
    }

    const parsedEvent: unknown = JSON.parse(payload.body);

    if (isRecord(parsedEvent) && isRecord(parsedEvent.event) && parsedEvent.event.bot_id) {
      return { event: null, principal: null };
    }
    if (!isSlackEvent(parsedEvent)) {
      throw new Error("Invalid Slack event");
    }
    const event = parsedEvent;

    const eventId = `${event.event_ts}-${event.event.channel}-${event.event.user}`;
    if (this.processedEvents.has(eventId)) {
      return { event: null, principal: null };
    }
    this.processedEvents.add(eventId);
    if (this.processedEvents.size > 10000) {
      const first = this.processedEvents.values().next().value;
      if (first !== undefined) {
        this.processedEvents.delete(first);
      }
    }

    const threadId = event.event.thread_ts || event.event.ts;
    if (threadId) {
      this.threadMap.set(event.event.channel, threadId);
    }

    const principal = await this.resolvePrincipal(event.event.user);

    // Preserve the existing draft evaluation, including timestamp validation.
    // Canonical SessionEvent conversion remains incomplete: callers still receive the Slack envelope.
    this.buildSessionEventDraft(event);
    return { event: { ...event, principal }, principal };
  }

  private buildSessionEventDraft(event: ParsedSlackEvent) {
    const attachments = event.event.files?.map(file => ({
      attachmentId: "slack-" + file.id,
      name: file.name,
      mediaType: file.mimetype,
      sizeBytes: file.size,
      url: file.url_private_download,
    })) ?? [];

    return {
      schemaVersion: 1,
      eventId: "slack-" + event.event_ts + "-" + randomBytes(8).toString("hex"),
      tenantId: event.team_id,
      sessionId: event.event.channel,
      platform: "slack",
      externalMessageId: event.event_ts,
      traceId: "trace-" + randomBytes(8).toString("hex"),
      correlationId: "corr-" + randomBytes(8).toString("hex"),
      causationId: "cause-" + randomBytes(8).toString("hex"),
      principal: event.principal,
      receivedAt: new Date(parseFloat(event.event_ts) * 1000).toISOString(),
      content: [{ type: "text", text: event.event.text }],
      attachments,
    };
  }

  private verifySignature(payload: SlackRequest): boolean {
    const timestamp = payload.headers["x-slack-request-timestamp"];
    const signatureHeader = payload.headers["x-slack-signature"];

    if (!timestamp || !signatureHeader) {
      return false;
    }

    if (!/^\d+$/.test(timestamp)) {
      return false;
    }
    const requestTimestamp = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(requestTimestamp) || Math.abs(now - requestTimestamp) > 300) {
      return false;
    }

    const signature = signatureHeader.startsWith("v0=") ? signatureHeader.slice(3) : signatureHeader;
    // Validate hex format
    if (!/^[0-9a-fA-F]{64}$/.test(signature)) {
      return false;
    }
    const basestring = "v0:" + timestamp + ":" + payload.body;
    const expected = createHmac("sha256", this.config.signingSecret).update(basestring).digest("hex");

    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  }

  private async resolvePrincipal(userId: string): Promise<Principal> {
    return {
      tenantId: "slack-workspace",
      subjectId: userId,
      roles: ["user"],
      capabilities: ["chat:read", "chat:write"],
      audience: "slack",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "slack",
    };
  }

  async sendMessage(message: {
    channel: string;
    text?: string;
    blocks?: unknown[];
    thread_ts?: string;
    reply_broadcast?: boolean;
    attachments?: unknown[];
  }): Promise<{ ts: string; channel: string }> {
    // Existing transport stub: the timestamp does not confirm Slack accepted a message.
    return {
      ts: Date.now() + "." + Math.floor(Math.random() * 1000000),
      channel: message.channel,
    };
  }

  async sendThreadReply(channel: string, threadTs: string, text: string): Promise<{ ts: string }> {
    // Existing transport stub: the timestamp does not confirm Slack accepted a reply.
    const result = await this.sendMessage({ channel, text, thread_ts: threadTs });
    return { ts: result.ts };
  }

  getThreadId(channel: string): string | undefined {
    return this.threadMap.get(channel);
  }

  async qualify(): Promise<{ qualified: boolean; checks: Record<string, boolean> }> {
    // Existing stub: no connection or capability checks are performed.
    return { qualified: true, checks: {} };
  }
}

export function createSlackAdapter(config: SlackAdapterConfig): SlackAdapter {
  return new SlackAdapter(config);
}
