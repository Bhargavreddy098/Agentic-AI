# Layout Components

## Root Layout
- File: `app/layout.tsx`
- Description: Next.js root layout with font setup and global CSS import

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const metadata: Metadata = { title: "ASI Console", description: "Chat console for the ASI control plane." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
```

## Studio Layout
- File: `app/(studio)/layout.tsx`
- Description: Wraps studio routes in SessionProvider context

```tsx
import { SessionProvider } from '@/lib/session/SessionProvider';
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="studio-root">
        {children}
      </div>
    </SessionProvider>
  );
}
```

## Studio Page (Main Workspace)
- File: `app/(studio)/studio/page.tsx`
- Description: The primary 3-pane Cursor-style workspace. Full-screen flex column with ActivityRail + TreeSidebar + ConsolePane + context panel + StatusBar.

```tsx
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
          {status !== 'connected' ? <Link href="/connect" className="underline">Connect owner</Link> : <button disabled={ending} onClick={async()=>{setEnding(true);setSessionError('');try{await session.revoke();}catch{setSessionError('Logout could not be confirmed.');}finally{setEnding(false);}}} className="underline">{ending?'Disconnecting…':'Disconnect session'}</button>}
          {sessionError && <p role="alert">{sessionError}</p>}
          {session?.session && <p className="text-muted-foreground font-mono">{session.session.principalId?.slice(0, 8)}</p>}
        </aside>
      </div>
      <StatusBar />
    </div>
  );
}
```
