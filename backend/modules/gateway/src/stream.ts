import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";


export interface StreamConfig {
  heartbeatInterval: number;
  maxMessageSize: number;
}

export interface StreamMessage {
  type: "progress" | "result" | "error" | "heartbeat";
  runId: string;
  payload: unknown;
  timestamp: string;
}

export interface StreamManagerConfig {
  maxConnections: number;
  heartbeatIntervalMs: number;
  messageTimeoutMs: number;
}

export class StreamManager {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, WebSocket> = new Map();
  private config: StreamManagerConfig;

  constructor(config: Partial<StreamManagerConfig> = {}) {
    this.config = {
      maxConnections: config.maxConnections ?? 100,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000,
      messageTimeoutMs: config.messageTimeoutMs ?? 60000,
    };
  }

  attachToServer(server: ReturnType<typeof createServer>): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws, req) => {
      const runId = new URL(req.url ?? "", `http://${req.headers.host}`).searchParams.get("runId");
      
      if (!runId) {
        ws.close(4001, "Missing runId parameter");
        return;
      }

      if (this.connections.size >= this.config.maxConnections) {
        ws.close(4002, "Max connections reached");
        return;
      }

      this.connections.set(runId, ws);

      ws.on("close", () => {
        this.connections.delete(runId);
      });

      ws.on("error", (err: Error) => {
        console.error(`WebSocket error for ${runId}:`, err);
        this.connections.delete(runId);
      });

      // Send welcome message
      this.send(runId, {
        type: "heartbeat",
        runId,
        payload: { connected: true },
        timestamp: new Date().toISOString(),
      });
    });

    // Heartbeat interval
    setInterval(() => {
      for (const [runId, ws] of this.connections) {
        if (ws.readyState === 1) { // WebSocket.OPEN
          this.send(runId, {
            type: "heartbeat",
            runId,
            payload: { timestamp: Date.now() },
            timestamp: new Date().toISOString(),
          });
        }
      }
    }, this.config.heartbeatIntervalMs);
  }

  send(runId: string, message: unknown): boolean {
    const ws = this.connections.get(runId);
    if (!ws || ws.readyState !== 1) { // WebSocket.OPEN = 1
      return false;
    }

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  broadcast(message: unknown): void {
    for (const [runId] of this.connections) {
      this.send(runId, message);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  close(): void {
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    if (this.wss) {
      this.wss.close();
    }
  }
}

export function createStreamManager(config?: Partial<StreamManagerConfig>) {
  return new StreamManager(config);
}

export function createStreamRoutes() {
  // HTTP routes for stream management stub.
}