"use client";

import { Activity, Folder, HeartPulse, ShieldCheck, SlidersHorizontal, Workflow, Database, Users, Settings, Network, MessageSquare } from 'lucide-react';

const items = [
  { id: 'health', icon: HeartPulse, label: 'Health' },
  { id: 'storage', icon: Database, label: 'Storage' },
  { id: 'overview', icon: Activity, label: 'Overview' },
  { id: 'projects', icon: Folder, label: 'Projects' },
  { id: 'conversations', icon: MessageSquare, label: 'Conversations' },
  { id: 'artifacts', icon: Network, label: 'Artifacts' },
  { id: 'approvals', icon: ShieldCheck, label: 'Approvals' },
  { id: 'providers', icon: SlidersHorizontal, label: 'Providers' },
  { id: 'models', icon: Network, label: 'Models' },
  { id: 'routing', icon: SlidersHorizontal, label: 'Routing' },
  { id: 'governance', icon: Settings, label: 'Governance' },
  { id: 'usage', icon: Workflow, label: 'Usage' },
];

export function ActivityRail({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <aside className="w-12 border-r flex flex-col items-center py-2 gap-1" aria-label="Surface navigation">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`p-2 rounded ${active === item.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title={item.label}
            aria-label={item.label}
            aria-pressed={active === item.id}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </aside>
  );
}