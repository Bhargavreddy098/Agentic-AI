import { findRoute } from './manifest.ts';
import { createClient } from './client.ts';

/**
 * Stage 01 — Backend health probe.
 *
 * The frontend must distinguish six distinct states, in order:
 *   1. frontend loaded      — React mounted; no probe issued yet
 *   2. backend reachable    — TCP/DNS resolved, HTTP responded
 *   3. backend live         — /health/live returned {status:"live"}
 *   4. backend ready        — /health/ready returned {ready:true}
 *   5. backend degraded     — live passed but a dependency is unavailable
 *   6. backend unavailable  — no HTTP response at all
 *
 * These are NOT the same as "the page rendered". A 200 from the browser
 * process is not backend readiness.
 */

export type HealthState =
  | 'frontend-loaded'
  | 'backend-unreachable'
  | 'backend-live'
  | 'backend-ready'
  | 'backend-degraded'
  | 'backend-unknown';

export type HealthProbe = {
  state: HealthState;
  live?: { status?: string };
  ready?: { ready?: boolean; dependencies?: Record<string, boolean> };
  error?: string;
  latencyMs?: number;
  timestamp: string;
};

function routeOrThrow(method: string, path: string) {
  const route = findRoute(method, path);
  if (!route) throw new Error(`No manifest route for ${method} ${path}`);
  return route;
}

export async function probeHealth(
  transport: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<HealthProbe> {
  const timestamp = new Date().toISOString();

  // 1. Live — process liveness. If this fails, the backend is unreachable.
  const liveStart = Date.now();
  let liveRes: Response;
  try {
    liveRes = await transport('/health/live', {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
  } catch {
    return { state: 'backend-unreachable', error: 'No HTTP response', timestamp };
  }

  const liveLatency = Date.now() - liveStart;
  if (!liveRes.ok) {
    return { state: 'backend-unreachable', error: `Liveness check failed (${liveRes.status})`, latencyMs: liveLatency, timestamp };
  }

  let live: { status?: string } = {};
  try {
    live = (await liveRes.json()) as { status?: string };
  } catch {
    // Malformed liveness body still means the process is alive.
  }

  if (live.status !== 'live') {
    return { state: 'backend-unknown', live, error: 'Liveness payload did not report status:"live"', latencyMs: liveLatency, timestamp };
  }

  // 2. Ready — dependency readiness.
  const readyStart = Date.now();
  let readyRes: Response;
  try {
    readyRes = await transport('/health/ready', {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
  } catch {
    // Process is live but readiness endpoint is unreachable.
    return { state: 'backend-unknown', live, error: 'Readiness endpoint unreachable', latencyMs: Date.now() - liveStart, timestamp };
  }

  let ready: { ready?: boolean; dependencies?: Record<string, boolean> } = {};
  try {
    ready = (await readyRes.json()) as { ready?: boolean; dependencies?: Record<string, boolean> };
  } catch {
    // Malformed readiness body — treat as degraded, not ready.
  }

  if (!readyRes.ok || ready.ready !== true) {
    return {
      state: 'backend-degraded',
      live,
      ready,
      error: ready.ready === false ? 'Required dependency unavailable' : `Readiness check failed (${readyRes.status})`,
      latencyMs: Date.now() - readyStart,
      timestamp,
    };
  }

  return {
    state: 'backend-ready',
    live,
    ready,
    latencyMs: Date.now() - readyStart,
    timestamp,
  };
}

export function healthLabel(state: HealthState): string {
  switch (state) {
    case 'frontend-loaded': return 'Frontend loaded';
    case 'backend-unreachable': return 'Backend unreachable';
    case 'backend-live': return 'Backend live';
    case 'backend-ready': return 'Backend ready';
    case 'backend-degraded': return 'Backend degraded';
    case 'backend-unknown': return 'Backend unknown';
  }
}

export function healthDotClass(state: HealthState): string {
  switch (state) {
    case 'backend-ready': return 'bg-emerald-500';
    case 'backend-live': return 'bg-amber-500';
    case 'backend-degraded': return 'bg-orange-500';
    case 'backend-unknown': return 'bg-yellow-500';
    case 'backend-unreachable': return 'bg-red-500';
    default: return 'bg-muted';
  }
}

export function healthAriaLabel(state: HealthState): string {
  switch (state) {
    case 'frontend-loaded': return 'Backend status unknown; probe not started';
    case 'backend-unreachable': return 'Backend is unreachable';
    case 'backend-live': return 'Backend process is live but not ready';
    case 'backend-ready': return 'Backend is ready';
    case 'backend-degraded': return 'Backend is degraded; a dependency is unavailable';
    case 'backend-unknown': return 'Backend status unknown';
  }
}

export function healthRetryable(state: HealthState): boolean {
  return state === 'backend-unreachable' || state === 'backend-degraded' || state === 'backend-unknown';
}