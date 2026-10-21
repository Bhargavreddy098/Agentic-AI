import { PrincipalSchema, type DeliveryRecord, type Principal } from "@asi/contracts";

export interface ChannelAdapter {
  normalize(input: unknown): Promise<NormalizedEvent>;
  send(record: DeliveryRecord): Promise<{ remoteReceiptId?: string; status: "sent" | "unknown" }>;
}

export interface ChannelConfig {
  name: string;
  maxInputSize: number;
  timeoutMs: number;
}

export interface NormalizedEvent {
  // Each channel owns its ingress payload until canonical event conversion is implemented.
  event: unknown;
  principal: Principal;
}

export abstract class BaseChannelAdapter<TConfig extends ChannelConfig = ChannelConfig> implements ChannelAdapter {
  protected config: TConfig;

  constructor(config: TConfig) {
    this.config = config;
  }

  abstract normalize(input: unknown): Promise<NormalizedEvent>;
  abstract send(record: DeliveryRecord): Promise<{ remoteReceiptId?: string; status: "sent" | "unknown" }>;

  protected validateInput(input: unknown): input is Record<string, unknown> {
    if (!input || typeof input !== "object") return false;
    return true;
  }

  protected extractPrincipal(): Principal | null {
    // Stub: principal extraction remains incomplete; each channel owns its ingress payload.
    return null;
  }
}

export interface HttpChannelConfig extends ChannelConfig {
  endpoint: string;
  authToken?: string;
  headers?: Record<string, string>;
}

export class HttpChannelAdapter extends BaseChannelAdapter<HttpChannelConfig> {
  override async normalize(input: unknown): Promise<NormalizedEvent> {
    if (!this.validateInput(input)) {
      throw new Error("Invalid HTTP input");
    }

    return {
      event: input.task,
      // Schema validation checks the JSON contract; authentication still belongs to ingress.
      principal: PrincipalSchema.parse(input.principal),
    };
  }

  override async send(): Promise<{ remoteReceiptId?: string; status: "sent" | "unknown" }> {
    // Existing transport stub: this receipt does not confirm remote delivery.
    return { status: "sent", remoteReceiptId: `http-${Date.now()}` };
  }
}

export interface WebSocketChannelConfig extends ChannelConfig {
  url: string;
  protocols?: string[];
}

export class WebSocketChannelAdapter extends BaseChannelAdapter<WebSocketChannelConfig> {
  override async normalize(input: unknown): Promise<NormalizedEvent> {
    return { event: input, principal: { tenantId: "", subjectId: "", roles: [], capabilities: [], audience: "", expiresAt: "", authenticatedSource: "" } };
  }

  override async send(): Promise<{ remoteReceiptId?: string; status: "sent" | "unknown" }> {
    // Existing transport stub: this receipt does not confirm remote delivery.
    return { status: "sent", remoteReceiptId: `ws-${Date.now()}` };
  }
}

export function createChannelAdapter(type: "http", config: HttpChannelConfig): HttpChannelAdapter;
export function createChannelAdapter(type: "websocket", config: WebSocketChannelConfig): WebSocketChannelAdapter;
export function createChannelAdapter(
  type: "http" | "websocket",
  config: HttpChannelConfig | WebSocketChannelConfig
): ChannelAdapter;
export function createChannelAdapter(
  type: "http" | "websocket",
  config: HttpChannelConfig | WebSocketChannelConfig
): ChannelAdapter {
  switch (type) {
    case "http":
      if (!("endpoint" in config)) throw new Error("Invalid HTTP channel config");
      return new HttpChannelAdapter(config);
    case "websocket":
      if (!("url" in config)) throw new Error("Invalid WebSocket channel config");
      return new WebSocketChannelAdapter(config);
    default:
      throw new Error(`Unknown channel type: ${type}`);
  }
}
