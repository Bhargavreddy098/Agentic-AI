import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { appendEpisode, searchEpisodes, recordCompression, getSessionEpisodes } from "@asi/episodic";
import { BoundedTextSchema, EpisodeCommandSchema, EpisodeKindSchema, OpaqueIdSchema, type Episode } from "@asi/contracts";
import { z } from "zod";

interface EpisodicOwnerConfig {
  port: number;
  dbPath: string;
  tenantId: string;
  signingKey: Uint8Array;
  keyId: string;
}

const AppendRequestSchema = z.strictObject({
  sessionId: OpaqueIdSchema,
  command: EpisodeCommandSchema,
});
type AppendRequest = z.infer<typeof AppendRequestSchema>;

const SearchRequestSchema = z.strictObject({
  sessionId: OpaqueIdSchema,
  query: BoundedTextSchema,
  limit: z.number().int().min(1).optional(),
  kind: EpisodeKindSchema.optional(),
});
type SearchRequest = z.infer<typeof SearchRequestSchema>;

interface CompressionRequest {
  sessionId: string;
  sourceEpisodeIds: string[];
  sourceRange: { startIndex: number; endIndex: number };
  sourceDigests: string[];
  prefixHash: string;
  summaryHash: string;
  modelVersion: string;
  policyVersion: string;
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

async function handleAppend(config: EpisodicOwnerConfig, request: AppendRequest) {
  const { sessionId, command } = request;

  const result = await appendEpisode(
    {
      dbPath: config.dbPath,
      tenantId: config.tenantId,
      keyId: config.keyId,
      signingKey: config.signingKey,
    },
    { sessionId, command },
  );

  return {
    receipt: result.receipt,
    episode: result.episode,
  };
}

async function handleSearch(config: EpisodicOwnerConfig, request: SearchRequest) {
  const { sessionId, query, limit = 50, kind } = request;

  const result = await searchEpisodes(
    { dbPath: config.dbPath, tenantId: config.tenantId },
    { sessionId, query, limit, ...(kind === undefined ? {} : { kind }) },
  );

  return result;
}

async function handleCompression(config: EpisodicOwnerConfig, request: CompressionRequest) {
  const { sessionId, sourceEpisodeIds, sourceRange, sourceDigests, prefixHash, summaryHash, modelVersion, policyVersion } = request;

  const result = await recordCompression(
    { dbPath: config.dbPath, tenantId: config.tenantId },
    {
      sessionId,
      sourceEpisodeIds,
      sourceRange,
      sourceDigests,
      prefixHash,
      summaryHash,
      modelVersion,
      policyVersion,
    },
  );

  return { compression: result.compression };
}

async function handleGetEpisodes(config: EpisodicOwnerConfig, sessionId: string, limit = 50, offset = 0, kind?: Episode["kind"]) {
  const result = await getSessionEpisodes(
    { dbPath: config.dbPath, tenantId: config.tenantId },
    { sessionId, limit, offset, ...(kind === undefined ? {} : { kind }) },
  );

  return result;
}

export async function startEpisodicOwner(ownerConfig: EpisodicOwnerConfig): Promise<void> {
  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing URL" }));
      return;
    }

    const url = new URL(req.url, `http://localhost:${ownerConfig.port}`);
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

    if (req.method === "POST" && !verifyRequestSignature(ownerConfig.signingKey, body, req.headers["x-signature"] as string)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    let response: unknown;
    let statusCode = 200;

    try {
      if (path === "/episodes/append" && req.method === "POST") {
        const parsed = AppendRequestSchema.parse(JSON.parse(body));
        response = await handleAppend(ownerConfig, parsed);
      } else if (path === "/episodes/search" && req.method === "POST") {
        const parsed = SearchRequestSchema.parse(JSON.parse(body));
        response = await handleSearch(ownerConfig, parsed);
      } else if (path === "/episodes/compression" && req.method === "POST") {
        const parsed = JSON.parse(body) as CompressionRequest;
        response = await handleCompression(ownerConfig, parsed);
      } else if (path === "/episodes" && req.method === "GET") {
        const sessionId = url.searchParams.get("sessionId");
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);
        const kindValue = url.searchParams.get("kind") || undefined;
        const kind = kindValue === undefined ? undefined : EpisodeKindSchema.parse(kindValue);

        if (!sessionId) {
          statusCode = 400;
          response = { error: "sessionId is required" };
        } else {
          response = await handleGetEpisodes(ownerConfig, sessionId, limit, offset, kind);
        }
      } else {
        statusCode = 404;
        response = { error: "Not found" };
      }
    } catch (err) {
      statusCode = 500;
      response = { error: err instanceof Error ? err.message : "Internal error" };
    }

    const responseBody = JSON.stringify(response);
    const signature = signResponse(ownerConfig.signingKey, responseBody);

    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "X-Signature": signature,
    });
    res.end(responseBody);
  });

  server.listen(ownerConfig.port, () => {
    console.log(`Episodic owner listening on port ${ownerConfig.port}`);
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    server.close(() => process.exit(0));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config: EpisodicOwnerConfig = {
    port: parseInt(process.env.EPISODIC_OWNER_PORT ?? "8082", 10),
    dbPath: process.env.EPISODIC_DB_PATH ?? "./data/episodic.db",
    tenantId: process.env.TENANT_ID ?? "default",
    signingKey: Buffer.from(process.env.EPISODIC_SIGNING_KEY ?? "", "base64"),
    keyId: process.env.EPISODIC_KEY_ID ?? "key-1",
  };

  if (!config.signingKey.length) {
    console.error("EPISODIC_SIGNING_KEY environment variable is required");
    process.exit(1);
  }

  await startEpisodicOwner(config);
}