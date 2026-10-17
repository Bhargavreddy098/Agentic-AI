import Database from "better-sqlite3";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";
import type { EpisodeCommand, Episode, AppendReceipt, Principal, Sha256Hex } from "@asi/contracts";

export interface EpisodicAppendConfig {
  dbPath: string;
  tenantId: string;
  signingKey: Uint8Array;
  keyId: string;
}

export interface AppendEpisodeInput {
  sessionId: string;
  command: EpisodeCommand;
  principal?: Principal;
}

export interface AppendEpisodeResult {
  receipt: AppendReceipt & { signature: string; [key: string]: unknown };
  episode: Episode;
}

const RECEIPT_SCHEMA_VERSION = 1;

export function computeEpisodeHash(episode: Episode): Sha256Hex {
  const canonical = JSON.stringify(
    {
      schema_version: episode.schemaVersion,
      tenant_id: episode.tenantId,
      session_id: episode.sessionId,
      episode_id: episode.episodeId,
      sequence: episode.sequence,
      kind: episode.kind,
      content: episode.content,
      source_ids: episode.sourceIds,
      created_at: episode.createdAt,
    },
    Object.keys({
      schema_version: 0,
      tenant_id: "",
      session_id: "",
      episode_id: "",
      sequence: 0,
      kind: "",
      content: "",
      source_ids: [],
      created_at: "",
    }).sort(),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

function computeReceiptHash(receipt: {
  schemaVersion: number;
  episodeId: string;
  sequence: number;
  contentHash: string;
  previousContentHash: string;
  writerEpoch: number;
  timestamp: string;
  keyId: string;
}): Sha256Hex {
  const canonical = JSON.stringify(
    {
      schema_version: receipt.schemaVersion,
      episode_id: receipt.episodeId,
      sequence: receipt.sequence,
      content_hash: receipt.contentHash,
      previous_content_hash: receipt.previousContentHash,
      writer_epoch: receipt.writerEpoch,
      timestamp: receipt.timestamp,
      key_id: receipt.keyId,
    },
    Object.keys({
      schema_version: 0,
      episode_id: "",
      sequence: 0,
      content_hash: "",
      previous_content_hash: "",
      writer_epoch: 0,
      timestamp: "",
      key_id: "",
    }).sort(),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

function signReceipt(hash: Sha256Hex, key: Uint8Array): string {
  return createHmac("sha256", key).update(hash).digest("hex");
}

export function verifyReceipt(hash: Sha256Hex, signature: string, key: Uint8Array): boolean {
  const expected = createHmac("sha256", key).update(hash).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export async function appendEpisode(
  config: EpisodicAppendConfig,
  input: AppendEpisodeInput,
): Promise<AppendEpisodeResult> {
  const { sessionId, command } = input;
  const { runContext, episodeId, kind, content, sourceEventId } = command;

  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");

  try {
    const stmt = db.prepare(`
      SELECT COALESCE(MAX(sequence), 0) AS max_seq
      FROM episodes
      WHERE tenant_id = ? AND session_id = ?
    `);
    const row = stmt.get(config.tenantId, sessionId) as { max_seq: number } | undefined;
    const sequence = (row?.max_seq ?? 0) + 1;

    const resolvedEpisodeId = episodeId ?? randomBytes(16).toString("hex");
    const now = Date.now();
    const contentHash = createHash("sha256").update(content ?? "").digest("hex");

    const sourceIds = sourceEventId ? [sourceEventId] : [];

    const episode: Episode = {
      schemaVersion: 1,
      tenantId: config.tenantId,
      sessionId,
      episodeId: resolvedEpisodeId,
      sequence,
      kind: kind ?? "user_message",
      content,
      sourceIds,
      createdAt: new Date(now).toISOString(),
    };

    const previousReceiptStmt = db.prepare(`
      SELECT content_hash FROM episodes
      WHERE tenant_id = ? AND session_id = ?
      ORDER BY sequence DESC LIMIT 1
    `);
    const previous = previousReceiptStmt.get(config.tenantId, sessionId) as { content_hash: string } | undefined;
    const previousContentHash = previous?.content_hash ?? "0".repeat(64);

    const writerEpoch = runContext?.writerEpoch ?? 1;

    const receiptWithoutSig = {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      episodeId: resolvedEpisodeId,
      sequence,
      contentHash,
      previousContentHash,
      writerEpoch,
      timestamp: new Date(now).toISOString(),
      keyId: config.keyId,
    };

    const receiptHash = computeReceiptHash(receiptWithoutSig);
    const signature = signReceipt(receiptHash, config.signingKey);

    const insertEpisode = db.prepare(`
      INSERT INTO episodes (
        episode_id, tenant_id, session_id, sequence, kind, content,
        source_ids, created_at, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFTS = db.prepare(`
      INSERT INTO episodes_fts (rowid, episode_id, tenant_id, session_id, kind, content, source_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      insertEpisode.run(
        resolvedEpisodeId,
        config.tenantId,
        sessionId,
        sequence,
        episode.kind,
        episode.content,
        JSON.stringify(episode.sourceIds),
        now,
        contentHash,
      );
      insertFTS.run(
        sequence,
        resolvedEpisodeId,
        config.tenantId,
        sessionId,
        episode.kind,
        episode.content,
        JSON.stringify(episode.sourceIds),
      );
    });

    tx();

    const receipt: AppendReceipt & { signature: string } = {
      commandId: command.commandId ?? resolvedEpisodeId,
      ...receiptWithoutSig,
      signature,
    };

    return { receipt, episode };
  } finally {
    db.close();
  }
}

export interface GetEpisodeConfig {
  dbPath: string;
  tenantId: string;
}

export async function getEpisode(
  config: GetEpisodeConfig,
  episodeId: string,
  sessionId: string,
): Promise<Episode | null> {
  const db = new Database(config.dbPath, { readonly: true });
  try {
    const stmt = db.prepare(`
      SELECT episode_id, tenant_id, session_id, sequence, kind, content, source_ids, created_at, content_hash
      FROM episodes
      WHERE tenant_id = ? AND session_id = ? AND episode_id = ?
    `);
    const row = stmt.get(config.tenantId, sessionId, episodeId) as
      | { episode_id: string; tenant_id: string; session_id: string; sequence: number; kind: string; content: string; source_ids: string; created_at: number; content_hash: string }
      | undefined;

    if (!row) return null;

    return {
      schemaVersion: 1,
      tenantId: row.tenant_id,
      sessionId: row.session_id,
      episodeId: row.episode_id,
      sequence: row.sequence,
      kind: row.kind as Episode["kind"],
      content: row.content,
      sourceIds: JSON.parse(row.source_ids),
      createdAt: new Date(row.created_at).toISOString(),
    };
  } finally {
    db.close();
  }
}

export interface GetSessionEpisodesConfig {
  dbPath: string;
  tenantId: string;
}

export async function getSessionEpisodes(
  config: GetSessionEpisodesConfig,
  sessionId: string,
  limit: number = 100,
  offset: number = 0,
): Promise<Episode[]> {
  const db = new Database(config.dbPath, { readonly: true });
  try {
    const stmt = db.prepare(`
      SELECT episode_id, tenant_id, session_id, sequence, kind, content, source_ids, created_at, content_hash
      FROM episodes
      WHERE tenant_id = ? AND session_id = ?
      ORDER BY sequence DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(config.tenantId, sessionId, limit, offset) as Array<{
      episode_id: string;
      tenant_id: string;
      session_id: string;
      sequence: number;
      kind: string;
      content: string;
      source_ids: string;
      created_at: number;
      content_hash: string;
    }>;

    return rows.map((row) => ({
      schemaVersion: 1,
      tenantId: row.tenant_id,
      sessionId: row.session_id,
      episodeId: row.episode_id,
      sequence: row.sequence,
      kind: row.kind as Episode["kind"],
      content: row.content,
      sourceIds: JSON.parse(row.source_ids),
      createdAt: new Date(row.created_at).toISOString(),
      contentHash: row.content_hash,
    }));
  } finally {
    db.close();
  }
}