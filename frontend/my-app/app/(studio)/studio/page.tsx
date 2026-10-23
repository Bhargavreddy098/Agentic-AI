"use client";

import Link from 'next/link';
import { useState } from 'react';
import { ActivityRail } from '@/components/shell/activity-rail';
import { StatusBar } from '@/components/shell/status-bar';
import { TreeSidebar } from '@/components/shell/tree-sidebar';
import { ConsolePane } from '@/components/console/console-pane';
import { useSession } from '@/lib/session/SessionProvider';

export default function StudioWorkspace() {
  const [active, setActive] = useState('overview');
  const [sessionError,setSessionError]=useState('');
  const [ending,setEnding]=useState(false);

  const session = useSession();
  const csrfToken = session?.session?.csrfToken ?? null;


  // Session state is only known after recovery runs in the browser.
  const status = session.status;

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
          <p>{status}</p>
          {status !== 'connected' ? <Link href="/connect" className="underline">Connect owner</Link> : <button disabled={ending} onClick={async()=>{setEnding(true);setSessionError('');try{await session.revoke();}catch{setSessionError('Logout could not be confirmed. Retry or check backend connectivity.');}finally{setEnding(false);}}} className="underline">{ending?'Disconnecting…':'Disconnect session'}</button>}
          {sessionError && <p role="alert">{sessionError}</p>}
          {session?.session && <p className="text-muted-foreground font-mono">{session.session.principalId?.slice(0, 8)}</p>}
        </aside>
      </div>
      <StatusBar />
    </div>
  );
}
