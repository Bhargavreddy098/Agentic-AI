"use client";

import { useState } from 'react';
import { ActivityRail } from '@/components/shell/activity-rail';
import { StatusBar } from '@/components/shell/status-bar';
import { TreeSidebar } from '@/components/shell/tree-sidebar';
import { ConsolePane } from '@/components/console/console-pane';
import { useSession } from '@/lib/session/SessionProvider';

export default function StudioWorkspace() {
  const [active, setActive] = useState('overview');
  const session = useSession() as any;
  const csrfToken = session?.session?.csrfToken ?? null;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        <ActivityRail active={active} onChange={setActive} />
        <TreeSidebar active={active} csrfToken={csrfToken} />
        <main className="flex-1 overflow-hidden">
          <ConsolePane />
        </main>
        <aside className="w-72 border-l p-2 text-xs">
          <h2 className="font-semibold mb-1">Session</h2>
          <p>{session?.status ?? 'unknown'}</p>
          {session?.session && <p className="text-muted-foreground font-mono">{session.session.principalId?.slice(0, 8)}</p>}
        </aside>
      </div>
      <StatusBar />
    </div>
  );
}
