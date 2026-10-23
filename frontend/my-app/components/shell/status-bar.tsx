import { coverage } from '@/lib/api/manifest';

export function formatCoverage(c: any) {
  const stages = Object.keys(c.byStage || {}).map(Number).sort((a,b) => a-b);
  const label = stages.length ? `Stage ${stages[0].toString().padStart(2,'0')}–${stages[stages.length-1].toString().padStart(2,'0')}` : 'Stage 01–06';
  return `${label} · ${c.implemented}/${c.expected}`;
}

export function StatusBar() {
  const c = coverage();
  return (
    <div className="h-6 border-t text-xs flex items-center px-2 gap-3">
      <span>● backend</span>
      <span>{formatCoverage(c)}</span>
    </div>
  );
}
