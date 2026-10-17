import type { Episode, RunContext } from "@asi/contracts";
import { searchEpisodes, getSessionEpisodes, type GetSessionEpisodesResult } from "@asi/episodic";

export interface RecallConfig {
  maxResults: number;
  minRelevanceScore: number;
}

export interface RecallResult {
  episodes: Array<{
    episode: Episode;
    relevanceScore: number;
    snippet: string;
  }>;
  totalMatches: number;
}

const DEFAULT_CONFIG: RecallConfig = {
  maxResults: 10,
  minRelevanceScore: 0.3,
};

/**
 * Recalls relevant episodes from episodic memory based on a query.
 * Uses FTS5 full-text search with ranking.
 */
export async function recall(
  query: string,
  context: RunContext,
  config: RecallConfig = DEFAULT_CONFIG
): Promise<RecallResult> {
  const result = await searchEpisodes(
    { dbPath: process.env.EPISODIC_DB_PATH || './episodic.db', tenantId: context.budgetRef.tenantId },
    { sessionId: context.sessionId, query, limit: config.maxResults }
  );
  
  return {
    episodes: result.episodes.map(e => ({
      episode: e.episode,
      relevanceScore: 1 - (e.rank / (config.maxResults + 1)),
      snippet: e.matchSnippet,
    })),
    totalMatches: result.totalMatches,
  };
}

/**
 * Recalls a specific episode by ID.
 */
export async function recallById(
  episodeId: string,
  context: RunContext
): Promise<Episode | null> {
  const result = await getSessionEpisodes(
    { dbPath: process.env.EPISODIC_DB_PATH || './episodic.db', tenantId: 'system' },
    { sessionId: context.sessionId, limit: 100 }
  );
  
  return result.episodes.find((e) => e.episodeId === episodeId) || null;
}

/**
 * Recalls episodes by kind/type.
 */
export async function recallByKind(
  kind: Episode["kind"],
  context: RunContext,
  limit: number = 20
): Promise<Episode[]> {
  const result = await getSessionEpisodes(
    { dbPath: process.env.EPISODIC_DB_PATH || './episodic.db', tenantId: 'system' },
    { sessionId: context.sessionId, limit, kind }
  );
  
  return result.episodes;
}

/**
 * Recalls the most recent episodes for context reconstruction.
 */
export async function recallRecent(
  context: RunContext,
  limit: number = 10
): Promise<GetSessionEpisodesResult> {
  return getSessionEpisodes(
    { dbPath: process.env.EPISODIC_DB_PATH || './episodic.db', tenantId: 'system' },
    { sessionId: context.sessionId, limit }
  );
}

/**
 * Reconstructs context from recalled episodes.
 */
export function reconstructContext(
  episodes: Array<{ episode: Pick<Episode, "kind" | "content">; relevanceScore?: number }>,
  maxTokens: number
): string {
  let context = '';
  let tokenCount = 0;
  
  for (const { episode } of episodes) {
    const content = episode.content;
    if (content === undefined) continue;
    const tokens = content.length / 4; // rough estimate
    
    if (tokenCount + tokens > maxTokens) {
      break;
    }
    
    context += `${episode.kind}: ${episode.content}\n\n`;
    tokenCount += tokens;
  }
  
  return context.trim();
}