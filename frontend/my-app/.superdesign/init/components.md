# Shared UI Components

## ActivityRail
- File: `components/shell/activity-rail.tsx`
- Description: Left icon navigation rail with 5 surface buttons
- Props: active (string), onChange ((id: string) => void)

```tsx
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
```

## StatusBar
- File: `components/shell/status-bar.tsx`
- Description: Bottom status bar showing backend health and coverage metrics
- Props: none (self-contained)

```tsx
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
```

## ItemList
- File: `components/stages/item-list.tsx`
- Description: Paginated list component for API records with Previous/Next/Refresh
- Props: method, path, pathParams?, csrfToken?, label, render?

```tsx
"use client";
import {useEffect,useState} from 'react';
import {createClient} from '@/lib/api/client';
import {findRoute} from '@/lib/api/manifest';
type RecordView=Record<string,unknown>;
export function ItemList({method,path,pathParams,csrfToken,label,render}:{method:string;path:string;pathParams?:Record<string,string>;csrfToken?:string|null;label:string;render?:(item:RecordView)=>React.ReactNode}) {
 const [items,setItems]=useState<RecordView[]|null>(null),[error,setError]=useState(''),[cursor,setCursor]=useState<string|undefined>(),[next,setNext]=useState<string|null>(null),[history,setHistory]=useState<(string|undefined)[]>([]),[revision,setRevision]=useState(0);
 const key=JSON.stringify(pathParams??{});
 useEffect(()=>{const refresh=()=>{setCursor(undefined);setHistory([]);setRevision(x=>x+1);};window.addEventListener('asi:records-changed',refresh);return()=>window.removeEventListener('asi:records-changed',refresh);},[]);
 useEffect(()=>{let cancelled=false;const timer=window.setTimeout(()=>{const params=JSON.parse(key);const route=findRoute(method,path);
  if(!route)return;
  if(!csrfToken){setItems(null);setError('');return;}
  setItems(null);setError('');setNext(null);
  const pageable=/\/projects$|\/artifacts$|\/conversations$|\/messages$|\/workspaces$|\/approvals$|\/providers$|\/models$|\/usage$|\/grants$/.test(path);
  createClient({getCsrfToken:()=>csrfToken}).request<RecordView[]>(route,{pathParams:params,query:pageable?{limit:'50',...(cursor?{cursor}:{})}:undefined}).then(res=>{
   if(cancelled)return;if(res.ok){const value=res.data as unknown as {items?:RecordView[]};setItems(Array.isArray(res.data)?res.data:value?.items??[]);setNext(String(res.meta?.nextCursor??'')||null);}else setError(res.problem.code+': '+res.problem.title);
  });},0);return()=>{cancelled=true;window.clearTimeout(timer);};
 },[method,path,csrfToken,key,cursor,revision]);
 if(error)return <p role="alert" className="text-xs text-red-500 p-2">{error}</p>;
 if(!items)return <p role="status" className="text-xs text-muted-foreground p-2">{csrfToken?'Loading '+label+'…':'Connect a session to load '+label+'.'}</p>;
 return <><ul className="text-xs divide-y">{items.map((item,i)=><li key={String(item.id??i)} className="p-2">{render?render(item):String(item.name??item.displayName??item.externalModelId??item.id??i)}</li>)}</ul>{!items.length&&<p className="text-xs p-2">No {label} yet.</p>}<div className="flex gap-2 p-2"><button disabled={!history.length} onClick={()=>{const previous=[...history];setCursor(previous.pop());setHistory(previous);}}>Previous</button><button disabled={!next} onClick={()=>{setHistory(h=>[...h,cursor]);setCursor(next??undefined);}}>Next</button><button onClick={()=>setRevision(x=>x+1)}>Refresh</button></div></>;
}
```

## ConsolePane
- File: `components/console/console-pane.tsx`
- Description: Center REPL console with command input, results display, file upload, artifact download
- Props: none (uses useSession context)
- Source: 173 lines, contains summarize(), run(), downloadArtifact(), uploadSelected() functions. Renders Entry[] list with input/note/result/err kinds, file upload controls, and command input.

## TreeSidebar
- File: `components/shell/tree-sidebar.tsx`
- Description: Left sidebar with surface-scoped sections and project-scoped record lists
- Props: active (string), csrfToken (string|null)
- Source: 76 lines. Contains ProjectPicker sub-component, SURFACES map, renders ItemList per section.
