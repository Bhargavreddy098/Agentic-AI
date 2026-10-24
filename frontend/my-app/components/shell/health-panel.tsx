"use client";

import { useEffect, useState } from 'react';
import { Database, RefreshCw, Server, ShieldCheck, Zap } from 'lucide-react';
import { probeHealth, healthAriaLabel, healthDotClass, healthLabel, healthRetryable, type HealthProbe, type HealthState } from '@/lib/api/health';

const POLL_INTERVAL_MS = 15_000;

/**
 * Stage 01 — Backend health panel.
 *
 * Renders the six-state health model explicitly:
 *   frontend-loaded → backend-unreachable → backend-live → backend-ready
 *   → backend-degraded → backend-unknown
 *
 * Each dependency from /health/ready is shown with its own status dot so
 * a failing PostgreSQL, missing pgvector, or absent provider is visible
 * without guessing. Never collapses "ready" into "page loaded".
 */
export function HealthPanel() {
  const [probe, setProbe] = useState<HealthProbe | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  async function runProbe(signal?: AbortSignal) {
    setLastError(null);
    try {
      const result = await probeHealth(fetch, signal);
      setProbe(result);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setLastError((err as Error).message);
      setProbe({ state: 'backend-unreachable', error: (err as Error).message, timestamp: new Date().toISOString() });
    }
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function poll() {
      if (cancelled) return;
      await runProbe(controller.signal);
      if (cancelled) return;
      const timer = setInterval(() => {
        if (cancelled) return;
        void runProbe(controller.signal);
      }, POLL_INTERVAL_MS);
      return timer;
    }

    let timer: ReturnType<typeof setInterval> | undefined;
    poll().then(t => { timer = t; });

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, []);

  const state: HealthState = probe?.state ?? 'frontend-loaded';
  const deps = probe?.ready?.dependencies ?? {};

  return (
    <section aria-labelledby="health-panel-title" className="rounded-lg border bg-card p-4">
      <div id="health-panel-title" className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Server size={16} className="text-muted-foreground" />
          Backend health
        </h2>
        <button
          type="button"
          onClick={() => { void runProbe(); }}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          aria-label="Refresh health probe"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${healthDotClass(state)}`}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">{healthLabel(state)}</span>
        {probe?.latencyMs !== undefined && (
          <span className="text-xs text-muted-foreground">{probe.latencyMs}ms</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-3" aria-live="polite">
        {healthAriaLabel(state)}
        {probe?.timestamp && <> · checked {new Date(probe.timestamp).toLocaleTimeString()}</>}
      </p>

      {probe?.error && (
        <p role="alert" className="text-xs text-destructive mb-3">
          {probe.error}
        </p>
      )}

      {state === 'backend-ready' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap size={12} /> Dependencies
          </div>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 text-xs">
              <ShieldCheck size={14} className="text-emerald-600" /> Process liveness
              <span className="ml-auto text-emerald-600">live</span>
            </li>
            {Object.entries(deps).length > 0 ? (
              Object.entries(deps).map(([name, ok]) => (
                <li key={name} className="flex items-center gap-2 text-xs">
                  {ok ? (
                    <Database size={14} className="text-emerald-600" />
                  ) : (
                    <Database size={14} className="text-destructive" />
                  )}
                  <span className="capitalize">{name.replace(/_/g, ' ')}</span>
                  <span className={`ml-auto ${ok ? 'text-emerald-600' : 'text-destructive'}`}>
                    {ok ? 'ok' : 'unavailable'}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-xs text-muted-foreground">No dependency details reported.</li>
            )}
          </ul>
        </div>
      )}

      {state === 'backend-degraded' && probe?.ready?.dependencies && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database size={12} /> Failing dependencies
          </div>
          <ul className="space-y-1.5">
            {Object.entries(probe.ready.dependencies)
              .filter(([, ok]) => !ok)
              .map(([name]) => (
                <li key={name} className="flex items-center gap-2 text-xs text-destructive">
                  <Database size={14} /> {name.replace(/_/g, ' ')}
                </li>
              ))}
          </ul>
        </div>
      )}

      {state === 'backend-unreachable' && (
        <p className="text-xs text-muted-foreground">
          Start the backend with <code className="bg-muted px-1 rounded">npm run dev</code> from the repository root, then refresh.
        </p>
      )}

      {lastError && (
        <p role="alert" className="text-xs text-destructive mt-2">{lastError}</p>
      )}
    </section>
  );
}
