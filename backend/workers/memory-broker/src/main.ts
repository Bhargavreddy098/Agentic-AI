import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { queryMemory, publishMemory, revertMemoryRevision, type QueryMemoryConfig } from "@asi/memory";
import type { Principal, MemoryQuery, MemoryWrite } from "@asi/contracts";

interface MemoryBrokerConfig {
  port: number;
  dbPool: QueryMemoryConfig["pool"] | null;
  signingKey: Uint8Array;
  keyId: string;
}

interface QueryRequest {
  principal: Principal;
  query: MemoryQuery;
  limit?: number;
}

interface PublishRequest {
  principal: Principal;
  write: MemoryWrite;
  expectedVersion: number | null;
}

interface RevertRequest {
  principal: Principal;
  memoryId: string;
  revisionId: string;
  tenantId: string;
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

function requireOwnerConfig(config: MemoryBrokerConfig): QueryMemoryConfig {
  if (config.dbPool === null) {
    throw new Error("Memory broker requires an initialized owner database pool");
  }
  return { pool: config.dbPool };
}

async function handleQuery(config: MemoryBrokerConfig, request: QueryRequest) {
  const result = await queryMemory(
    requireOwnerConfig(config),
    {
      principal: request.principal,
      query: request.query,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    },
  );

  return result;
}

async function handlePublish(config: MemoryBrokerConfig, request: PublishRequest) {
  const result = await publishMemory(
    requireOwnerConfig(config),
    {
      principal: request.principal,
      write: request.write,
      expectedVersion: request.expectedVersion,
    },
  );

  return result;
}

async function handleRevert(config: MemoryBrokerConfig, request: RevertRequest) {
  const result = await revertMemoryRevision(
    requireOwnerConfig(config),
    {
      principal: request.principal,
      memoryId: request.memoryId,
      revisionId: request.revisionId,
      tenantId: request.tenantId,
    },
  );

  return result;
}

export async function startMemoryBroker(config: MemoryBrokerConfig): Promise<void> {
  requireOwnerConfig(config);
  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing URL" }));
      return;
    }

    const url = new URL(req.url, `http://localhost:${config.port}`);
    const path = url.pathname;

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    if (!verifyRequestSignature(config.signingKey, body, req.headers["x-signature"] as string)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    let response: unknown;
    let statusCode = 200;

    try {
      if (path === "/memory/query" && req.method === "POST") {
        const parsed = JSON.parse(body) as QueryRequest;
        response = await handleQuery(config, parsed);
      } else if (path === "/memory/publish" && req.method === "POST") {
        const parsed = JSON.parse(body) as PublishRequest;
        response = await handlePublish(config, parsed);
      } else if (path === "/memory/revert" && req.method === "POST") {
        const parsed = JSON.parse(body) as RevertRequest;
        response = await handleRevert(config, parsed);
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
    console.log(`Memory broker listening on port ${config.port}`);
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    server.close(() => process.exit(0));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config: MemoryBrokerConfig = {
    port: parseInt(process.env.MEMORY_BROKER_PORT ?? "8083", 10),
    dbPool: null, // Will be initialized from env
    signingKey: Buffer.from(process.env.MEMORY_BROKER_SIGNING_KEY ?? "", "base64"),
    keyId: process.env.MEMORY_BROKER_KEY_ID ?? "key-1",
  };

  if (!config.signingKey.length) {
    console.error("MEMORY_BROKER_SIGNING_KEY environment variable is required");
    process.exit(1);
  }

  await startMemoryBroker(config);
}