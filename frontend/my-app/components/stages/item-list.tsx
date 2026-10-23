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
