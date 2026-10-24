"use client";

import { useEffect, useState } from 'react';
import { coverage } from '@/lib/api/manifest';
import { frontendReach, formatStageRange } from '@/lib/api/status';
import { probeHealth, healthAriaLabel, healthDotClass, healthLabel, type HealthState } from '@/lib/api/health';

export function formatCoverage(c: { implemented: number; expected: number; byStage: Record<number, number> }) {
  return `${formatStageRange(c.byStage)} · backend ${c.implemented}/${c.expected}`;
}

export function formatReach(r: { reachable: number; total: number }) {
  return `frontend ${r.reachable}/${r.total}`;
}

/**
 * Stage 01 — Bottom status bar.
 *
 * Shows backend health as one of six states, never "page loaded".
 * The dot color is the only signal; the label spells it out.
 */
export function StatusBar() {
  const c = coverage();
  const reach = frontendReach();
  const [health, setHealth] = useState<HealthState>('frontend-loaded');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      setMounted(true);
      try {
        const probe = await probeHealth(fetch);
        if (!cancelled) setHealth(probe.state);
      } catch {
        if (!cancelled) setHealth('backend-unreachable');
      }
    }

    void tick();
    const timer = setInterval(() => { void tick(); }, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Never render a health verdict before the probe has run.
  const label = mounted ? healthLabel(health) : 'Frontend loaded';
  const aria = mounted ? healthAriaLabel(health) : 'Backend status unknown';

  return (
    <div className="studio-statusbar h-6 border-t text-xs flex items-center px-2 gap-3" role="status" aria-label={aria}>
      <span className="inline-flex items-center gap-1">
        <i className={`inline-block w-1.5 h-1.5 rounded-full ${healthDotClass(health)}`} aria-hidden="true" />
        backend {label}
      </span>
      <span className="opacity-60">Backend manifest: {formatCoverage(c)}</span>
      <span title={reach.missing.length ? 'No UI path: ' + reach.missing.join(', ') : 'Every route has a UI path'}>
        {formatReach(reach)}
      </span>
    </div>
  );
}
