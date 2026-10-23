"use client";

import { useEffect, useState } from 'react';
import { coverage } from '@/lib/api/manifest';
import { frontendReach, formatStageRange } from '@/lib/api/status';

export function formatCoverage(c: { implemented: number; expected: number; byStage: Record<number, number> }) {
  return `${formatStageRange(c.byStage)} · backend ${c.implemented}/${c.expected}`;
}

export function formatReach(r: { reachable: number; total: number }) {
  return `frontend ${r.reachable}/${r.total}`;
}

export function StatusBar() {
  const c = coverage();
  const reach = frontendReach();
  const [health, setHealth] = useState<'checking' | 'ready' | 'unready'>('checking');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    fetch('/health/ready', { credentials: 'include', cache: 'no-store' })
      .then(res => { if (!cancelled) setHealth(res.ok ? 'ready' : 'unready'); })
      .catch(() => { if (!cancelled) setHealth('unready'); });
    return () => { cancelled = true; };
  }, []);

  const dot = health === 'ready' ? 'bg-green-500' : health === 'unready' ? 'bg-red-500' : 'bg-yellow-500';
  const label = mounted && health !== 'checking' ? health : 'checking';

  return (
    <div className="h-6 border-t text-xs flex items-center px-2 gap-3">
      <span className="inline-flex items-center gap-1">
        <i className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        backend {label}
      </span>
      <span className="opacity-60">{formatCoverage(c)}</span>
      <span title={reach.missing.length ? 'No UI path: ' + reach.missing.join(', ') : 'Every route has a UI path'}>
        {formatReach(reach)}
      </span>
    </div>
  );
}
