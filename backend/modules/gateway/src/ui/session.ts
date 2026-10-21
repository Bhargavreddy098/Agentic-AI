import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { UiPrincipal } from "./ports.js";

export const SESSION_COOKIE = "asi_session";

export interface UiSessionRecord {
  sessionId: string;
  csrfToken: string;
  principal: UiPrincipal;
  expiresAt: number;
}

export interface UiSessionStore {
  create(principal: UiPrincipal): UiSessionRecord;
  get(sessionId: string | undefined): UiSessionRecord | null;
  revoke(sessionId: string): void;
}

export interface SessionStoreOptions {
  ttlMs?: number;
  maxSessions?: number;
  now?: () => number;
}

export function createSessionStore(options: SessionStoreOptions = {}): UiSessionStore {
  const ttlMs = options.ttlMs ?? 30 * 60 * 1000;
  const maxSessions = options.maxSessions ?? 1_000;
  const now = options.now ?? Date.now;
  const sessions = new Map<string, UiSessionRecord>();

  function prune(current: number) {
    for (const [id, record] of sessions) {
      if (record.expiresAt <= current) sessions.delete(id);
    }
    while (sessions.size >= maxSessions) {
      const oldest = sessions.keys().next().value;
      if (oldest === undefined) break;
      sessions.delete(oldest);
    }
  }

  return {
    create(principal) {
      const current = now();
      prune(current);
      const record: UiSessionRecord = {
        sessionId: randomUUID(),
        csrfToken: randomBytes(24).toString("base64url"),
        principal,
        expiresAt: current + ttlMs,
      };
      sessions.set(record.sessionId, record);
      return record;
    },
    get(sessionId) {
      if (!sessionId) return null;
      const record = sessions.get(sessionId);
      if (!record) return null;
      if (record.expiresAt <= now()) {
        sessions.delete(sessionId);
        return null;
      }
      return record;
    },
    revoke(sessionId) {
      sessions.delete(sessionId);
    },
  };
}

export function csrfMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
