import type { Principal, RunContext } from "@asi/contracts";
import "@asi/episodic";

export interface SessionConfig {
  maxSessionAge: number;
  maxEpisodesPerSession: number;
}

export interface SessionState {
  sessionId: string;
  principal: Principal;
  context: RunContext;
  createdAt: string;
  updatedAt: string;
  episodeCount: number;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxSessionAge: 3600000,
  maxEpisodesPerSession: 1000,
};

export class SessionManager {
  // Limits are retained as configuration; their enforcement is not implemented here.
  private config: SessionConfig;
  private sessions: Map<string, SessionState> = new Map();

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  async createSession(
    sessionId: string,
    principal: Principal,
    context: RunContext
  ): Promise<SessionState> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      throw new Error(`Session already exists: ${sessionId}`);
    }

    const state: SessionState = {
      sessionId,
      principal,
      context,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      episodeCount: 0,
    };

    this.sessions.set(sessionId, state);
    return state;
  }

  async getSession(sessionId: string): Promise<SessionState | undefined> {
    return this.sessions.get(sessionId);
  }

  async updateSession(
    sessionId: string,
    updates: Partial<SessionState>
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const updated = { ...session, ...updates, updatedAt: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async incrementEpisodes(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.episodeCount++;
      session.updatedAt = new Date().toISOString();
    }
  }

  async getSessionProgress(sessionId: string): Promise<{
    episodeCount: number;
    lastEpisodeAt?: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) return { episodeCount: 0 };

    return {
      episodeCount: session.episodeCount,
      lastEpisodeAt: session.updatedAt,
    };
  }
}

export function createSessionManager(config?: Partial<SessionConfig>): SessionManager {
  return new SessionManager(config);
}

export function createSessionRoutes(): void {
  // HTTP routes for session management stub.
}