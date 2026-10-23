"use client";

import { useState } from 'react';
import { MANIFEST_ROUTES } from '@/lib/api/manifest';
import { createClient } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';

export function ConsolePane() {
  const [cmd, setCmd] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const session = useSession() as any;
  const client = createClient({ getCsrfToken: () => session?.session?.csrfToken });

  function run() {
    setLog(l => [...l, `> ${cmd}`, '(console ready - use typed API)']);
    setCmd('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-2 text-sm font-mono space-y-1">
        {log.map((l,i) => <div key={i}>{l}</div>)}
      </div>
      <div className="border-t p-2 flex gap-2">
        <input value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()} className="flex-1 border p-1 text-sm" placeholder="command..." />
        <button onClick={run} className="border px-2">Run</button>
      </div>
    </div>
  );
}
