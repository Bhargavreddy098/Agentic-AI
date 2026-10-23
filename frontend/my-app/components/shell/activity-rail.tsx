"use client";

import { Activity, Folder, ShieldCheck, SlidersHorizontal, Workflow } from 'lucide-react';

const items = [
  { id: 'overview', icon: Activity, label: 'Overview' },
  { id: 'projects', icon: Folder, label: 'Projects' },
  { id: 'approvals', icon: ShieldCheck, label: 'Approvals' },
  { id: 'providers', icon: SlidersHorizontal, label: 'Providers' },
  { id: 'usage', icon: Workflow, label: 'Usage' },
];

export function ActivityRail({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <aside className="w-12 border-r flex flex-col items-center py-2 gap-1">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <button key={item.id} onClick={() => onChange(item.id)} className={`p-2 rounded ${active === item.id ? 'bg-accent' : ''}`} title={item.label}>
            <Icon size={18} />
          </button>
        );
      })}
    </aside>
  );
}
