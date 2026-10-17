import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { createQueueAdapter, type QueuePort } from "@asi/specialists";
import type { TaskEnvelope } from "@asi/contracts";

interface SpecialistConfig {
  port: number;
  signingKey: Uint8Array;
  keyId: string;
  queue: QueuePort;
}

interface EnqueueRequest {
  task: TaskEnvelope;
}

interface ReconcileRequest {
  effectId: string;
}

function verifyRequestSignature(
  signingKey: Uint8Array,
  body: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", signingKey).update(body).digest("hex");
  const provided = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return timingSafeEqual(provided, expectedBuf);
}

function signResponse(signingKey: Uint8Array, body: string): string {
  return createHmac("sha256", signingKey).update(body).digest("hex");
}

async function handleEnqueue(config: SpecialistConfig, request: EnqueueRequest) {
  const result = await config.queue.enqueueTask(request.task);
  return result;
}

async function handleReconcile(_config: SpecialistConfig, request: ReconcileRequest) {
  return { reconciled: false, effectId: request.effectId };
}

async function handleStats(config: SpecialistConfig) {
  return await config.queue.getQueueStats();
}

export async function startSpecialist(config: SpecialistConfig): Promise<void> {
  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing URL" }));
      return;
    }

    const url = new URL(req.url, `http://localhost:${config.port}`);
    const path = url.pathname;

    if (req.method !== "POST" && req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    if (req.method === "POST" && !verifyRequestSignature(config.signingKey, body, req.headers["x-signature"] as string)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    let response: unknown;
    let statusCode = 200;

    try {
      if (path === "/tasks/enqueue" && req.method === "POST") {
        const request = JSON.parse(body) as EnqueueRequest;
        response = await handleEnqueue(config, request);
      } else if (path === "/tasks/reconcile" && req.method === "POST") {
        const request = JSON.parse(body) as ReconcileRequest;
        response = await handleReconcile(config, request);
      } else if (path === "/stats" && req.method === "GET") {
        response = await handleStats(config);
      } else {
        statusCode = 404;
        response = { error: "Not found" };
      }
    } catch (err) {
      statusCode = 500;
      response = { error: err instanceof Error ? err.message : "Internal error" };
    }

    const responseBody = JSON.stringify(response);
    const signature = signResponse(config.signingKey, responseBody);

    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "X-Signature": signature,
    });
    res.end(responseBody);
  });

  server.listen(config.port, () => {
    console.log(`Specialist listening on port ${config.port}`);
  });

  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down...");
    await config.queue.close();
    server.close(() => process.exit(0));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const signingKey = Buffer.from(process.env.SPECIALIST_SIGNING_KEY ?? "", "base64");
  const keyId = process.env.SPECIALIST_KEY_ID ?? "key-1";

  if (!signingKey.length) {
    console.error("SPECIALIST_SIGNING_KEY environment variable is required");
    process.exit(1);
  }

  const queue = createQueueAdapter();

  await startSpecialist({
    port: parseInt(process.env.SPECIALIST_PORT ?? "8083", 10),
    signingKey,
    keyId,
    queue,
  });
}