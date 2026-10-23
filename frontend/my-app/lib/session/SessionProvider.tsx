"use client";
import {createContext,useContext,useEffect,useState,useSyncExternalStore} from 'react';
import {createSessionStore,type SessionView} from './session-store';
const initial:{session:SessionView|null;status:'unknown'}={session:null,status:'unknown'};
const SessionContext=createContext<ReturnType<typeof createSessionStore>|null>(null);
export function SessionProvider({children}:{children:React.ReactNode}){
 const [store]=useState(()=>createSessionStore());
 useEffect(()=>{void store.recover();},[store]);
 return <SessionContext.Provider value={store}>{children}</SessionContext.Provider>;
}
export function useSession(){const store=useContext(SessionContext);if(!store)throw new Error('useSession requires SessionProvider');const state=useSyncExternalStore(store.subscribe,store.get,()=>initial);return {...store,session:state.session,status:state.status};}
