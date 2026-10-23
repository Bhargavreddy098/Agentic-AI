"use client";

import { useEffect, useState } from 'react';
import { coverage } from '@/lib/api/manifest';

export function formatCoverage(c: any) {
  const stages = Object.keys(c.byStage || {}).map(Number).sort((a, b) => a - b);
  const label = stages.length ? `Stage ${stages[0].toString().padStart(2, '0')}–${stages[stages.length - 1].toString().padStart(2, '0')}` : 'Stage 01–06';
  return `${label} · ${c.implemented}/${c.expected}`;
}

export function StatusBar() {
  const c = coverage();
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
  // Server and first client render must agree; health is only known after mount.
  const label = mounted && health !== 'checking' ? health : 'checking';

  return (
    <div className="h-6 border-t text-xs flex items-center px-2 gap-3">
      <span className="inline-flex items-center gap-1">
        <i className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        backend {label}
      </span>
      <span>{formatCoverage(c)}</span>
    </div>
  );
}
