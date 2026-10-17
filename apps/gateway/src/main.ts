import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer, Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { createGatewayApp } from "@asi/gateway";
import { createStreamManager } from "@asi/gateway";
import { createSessionManager } from "@asi/gateway";
import { createDeliveryManager } from "@asi/gateway";
import "@asi/identity";
import "@asi/episodic";
import "@asi/policy";

interface GatewayConfig {
  port: number;
  maxInputSize: number;
  signingKey: Uint8Array;
  keyId: string;
  stream: {
    maxConnections: number;
    heartbeatIntervalMs: number;
  };
  delivery: {
    maxRetries: number;
    retryDelayMs: number;
  };
}

interface GatewayServices {
  app: ReturnType<typeof createGatewayApp>;
  streamManager: ReturnType<typeof createStreamManager>;
  sessionManager: ReturnType<typeof createSessionManager>;
  deliveryManager: ReturnType<typeof createDeliveryManager>;
}

function createGatewayServices(config: GatewayConfig): GatewayServices {
  const app = createGatewayApp({
    maxInputSize: config.maxInputSize,
    signingKey: config.signingKey,
    keyId: config.keyId,
  });

  const streamManager = createStreamManager({
    maxConnections: config.stream.maxConnections,
    heartbeatIntervalMs: config.stream.heartbeatIntervalMs,
  });

  const sessionManager = createSessionManager({
    maxSessionAge: 3600000,
    maxEpisodesPerSession: 1000,
  });

  const deliveryManager = createDeliveryManager({
    maxRetries: config.delivery.maxRetries,
    retryDelayMs: config.delivery.retryDelayMs,
    signingKey: new Uint8Array(32),
    keyId: "delivery-key",
  });

  return {
    app,
    streamManager,
    sessionManager,
    deliveryManager,
  };
}

export function createGatewayServer(config: GatewayConfig): { server: Server; services: GatewayServices } {
  const services = createGatewayServices(config);

  // Add health check endpoint to the app created by the gateway services.
  const appWithHealth = services.app
    .get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

  // Add session routes
  appWithHealth.get("/sessions/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    // In a real implementation, this would query sessionManager
    return c.json({ sessionId, status: "active" });
  });

  appWithHealth.post("/sessions", async (c) => {
    const body: unknown = await c.req.json<unknown>();
    // TODO: Use body for session creation parameters
    return c.json({ sessionId: `session-${Date.now()}`, received: !!body }, 201);
  });

  appWithHealth.get("/delivery/stats", async (c) => {
    return c.json({ pending: 0, sent: 0, failed: 0 });
  });

  const server = createAdaptorServer({ fetch: appWithHealth.fetch, createServer });
  // The adapter also supports HTTP/2; this entry point explicitly creates an HTTP server.
  if (!(server instanceof Server)) {
    throw new Error("Expected a Node HTTP server");
  }
  return { server, services };
}

export async function startGateway(config: GatewayConfig): Promise<void> {
  const { server, services } = createGatewayServer(config);

  // Attach the stream manager already configured by the service factory.
  services.streamManager.attachToServer(server);

  server.listen(config.port, () => {
    console.log(`Gateway listening on port ${config.port}`);
  });

  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down...");
    // Graceful shutdown
    process.exit(0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config: GatewayConfig = {
    port: parseInt(process.env.GATEWAY_PORT ?? "8080", 10),
    maxInputSize: 1024 * 1024, // 1 MiB
    signingKey: Buffer.from(process.env.GATEWAY_SIGNING_KEY ?? "", "base64"),
    keyId: process.env.GATEWAY_KEY_ID ?? "key-1",
    stream: {
      maxConnections: parseInt(process.env.GATEWAY_MAX_CONNECTIONS ?? "100", 10),
      heartbeatIntervalMs: parseInt(process.env.GATEWAY_HEARTBEAT_MS ?? "30000", 10),
    },
    delivery: {
      maxRetries: 3,
      retryDelayMs: 1000,
    },
  };

  if (!config.signingKey.length) {
    console.error("GATEWAY_SIGNING_KEY environment variable is required");
    process.exit(1);
  }

  await startGateway(config);
}