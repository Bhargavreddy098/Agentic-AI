"use client";

import { useState } from 'react';
import { ActivityRail } from '@/components/shell/activity-rail';
import { StatusBar } from '@/components/shell/status-bar';
import { ConsolePane } from '@/components/console/console-pane';

export default function StudioWorkspace() {
  const [active, setActive] = useState('overview');
  return (
    <div className="h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        <ActivityRail active={active} onChange={setActive} />
        <aside className="w-64 border-r p-2 text-sm">Explorer</aside>
        <main className="flex-1">
          <ConsolePane />
        </main>
        <aside className="w-72 border-l p-2 text-sm">Context</aside>
      </div>
      <StatusBar />
    </div>
  );
}
