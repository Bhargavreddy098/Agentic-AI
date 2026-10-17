import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { Episode } from "@asi/contracts";

export interface SearchEpisodesConfig {
  dbPath: string;
  tenantId: string;
}

export interface SearchEpisodesInput {
  sessionId: string;
  query: string;
  limit?: number;
  kind?: Episode["kind"];
}

export interface SearchEpisodesResult {
  episodes: Array<{
    episode: Episode;
    rank: number;
    matchSnippet: string;
  }>;
  totalMatches: number;
}

export async function searchEpisodes(
  config: SearchEpisodesConfig,
  input: SearchEpisodesInput,
): Promise<SearchEpisodesResult> {
  const { sessionId, query, limit = 50, kind } = input;

  if (!existsSync(config.dbPath)) {
    return { episodes: [], totalMatches: 0 };
  }

  const db = new Database(config.dbPath, { readonly: true });

  try {
    let whereClause = `
      e.tenant_id = ? AND e.session_id = ?
    `;
    const params: unknown[] = [config.tenantId, sessionId];

    if (kind) {
      whereClause += ` AND e.kind = ?`;
      params.push(kind);
    }

    const ftsQuery = query.trim().split(/\s+/).map((t) => `${t}*`).join(" ");
    whereClause += ` AND episodes_fts MATCH ?`;
    params.push(ftsQuery);

    const countStmt = db.prepare(
      "SELECT COUNT(*) as total\n" +
      "  FROM episodes_fts\n" +
      "  JOIN episodes e ON episodes_fts.rowid = e.rowid\n" +
      "WHERE " + whereClause
    );

    const countResult = countStmt.get(...params) as { total: number } | undefined;
    const totalMatches = countResult?.total ?? 0;

    params.push(limit);
    const rows = db.prepare(
      "SELECT\n" +
      "  e.episode_id,\n" +
      "  e.tenant_id,\n" +
      "  e.session_id,\n" +
      "  e.sequence,\n" +
      "  e.kind,\n" +
      "  e.content,\n" +
      "  e.source_ids,\n" +
      "  e.created_at,\n" +
      "  e.content_hash,\n" +
      "  episodes_fts.rank\n" +
      "FROM episodes_fts\n" +
      "JOIN episodes e ON episodes_fts.rowid = e.rowid\n" +
      "WHERE " + whereClause +
      " ORDER BY episodes_fts.rank\n" +
      "LIMIT ?"
    ).all(...params) as Array<{
      episode_id: string;
      tenant_id: string;
      session_id: string;
      sequence: number;
      kind: string;
      content: string;
      source_ids: string;
      created_at: number;
      content_hash: string;
      rank: number;
    }>;

    const episodes: Array<{
      episode: Episode;
      rank: number;
      matchSnippet: string;
    }> = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!row) continue;
      const episode: Episode = {
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
      episodes.push({
        episode,
        rank: row.rank ?? index,
        matchSnippet: generateSnippet(row.content, config.tenantId),
      });
    }

    return { episodes, totalMatches };
  } finally {
    db.close();
  }
}

export interface GetSessionEpisodesConfig {
  dbPath: string;
  tenantId: string;
}

export interface GetSessionEpisodesInput {
  sessionId: string;
  limit?: number;
  offset?: number;
  kind?: Episode["kind"];
}

export interface GetSessionEpisodesResult {
  episodes: Episode[];
  totalMatches: number;
}

export async function getSessionEpisodes(
  config: GetSessionEpisodesConfig,
  input: GetSessionEpisodesInput,
): Promise<GetSessionEpisodesResult> {
  const { sessionId, limit = 50, offset = 0, kind } = input;

  if (!existsSync(config.dbPath)) {
    return { episodes: [], totalMatches: 0 };
  }

  const db = new Database(config.dbPath, { readonly: true });
  try {
    let whereClause = `
      e.tenant_id = ? AND e.session_id = ?
    `;
    const params: unknown[] = [config.tenantId, sessionId];

    if (kind) {
      whereClause += ` AND e.kind = ?`;
      params.push(kind);
    }

    const countStmt = db.prepare(
      "SELECT COUNT(*) as total\n" +
      "  FROM episodes_fts\n" +
      "  JOIN episodes e ON episodes_fts.rowid = e.rowid\n" +
      "WHERE " + whereClause
    );

    const countResult = countStmt.get(...params) as { total: number } | undefined;
    const totalMatches = countResult?.total ?? 0;

    const selectStmt = db.prepare(
      "SELECT\n" +
      "  e.episode_id,\n" +
      "  e.tenant_id,\n" +
      "  e.session_id,\n" +
      "  e.sequence,\n" +
      "  e.kind,\n" +
      "  e.content,\n" +
      "  e.source_ids,\n" +
      "  e.created_at,\n" +
      "  e.content_hash\n" +
      "FROM episodes_fts\n" +
      "JOIN episodes e ON episodes_fts.rowid = e.rowid\n" +
      "WHERE " + whereClause +
      " ORDER BY e.sequence DESC\n" +
      "LIMIT ? OFFSET ?"
    );

    params.push(limit, offset);
    const rows = selectStmt.all(...params) as Array<{
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

    const episodes: Episode[] = [];

    for (const row of rows) {
      if (!row) continue;
      const episode: Episode = {
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
      episodes.push(episode);
    }

    return {
      episodes,
      totalMatches,
    };
  } finally {
    db.close();
  }
}

function generateSnippet(content: string, query: string): string {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return content.slice(0, 200);

  const lowerContent = content.toLowerCase();
  let bestIndex = 0;
  let bestScore = -1;

  for (const term of terms) {
    const lowerTerm = term.toLowerCase().replace(/\*/g, "");
    let index = lowerContent.indexOf(lowerTerm);
    while (index !== -1) {
      const start = Math.max(0, index - 100);
      const end = Math.min(content.length, index + lowerTerm.length + 100);
      const snippet = content.slice(start, end);
      const score = snippet.length;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = start;
      }
      index = lowerContent.indexOf(lowerTerm, index + 1);
    }
  }

  return content.slice(bestIndex, bestIndex + 200).trim();
}

export interface GetEpisodeConfig {
  dbPath: string;
  tenantId: string;
}

export async function getEpisodeById(
  config: GetEpisodeConfig,
  sessionId: string,
  episodeId: string,
): Promise<Episode | null> {
  if (!existsSync(config.dbPath)) {
    return null;
  }
  const db = new Database(config.dbPath, { readonly: true });
  try {
    const stmt = db.prepare(`
      SELECT episode_id, tenant_id, session_id, sequence, kind, content, source_ids, created_at
      FROM episodes
      WHERE tenant_id = ? AND session_id = ? AND episode_id = ?
    `);
    const row = stmt.get(config.tenantId, sessionId, episodeId) as {
      episode_id: string;
      tenant_id: string;
      session_id: string;
      sequence: number;
      kind: string;
      content: string;
      source_ids: string;
      created_at: number;
    } | undefined;
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