import manifest from '../../../../docs/backend/api/frontend-stage07.manifest.json' with {type:'json'};
import {createClient,type RequestOptions} from './client.ts';
import type {ApiRoute} from './types.ts';
import {isUuid} from './workbench.ts';

export const EXECUTION_ROUTES=manifest.routes;
export function executionApi(client:ReturnType<typeof createClient>){return async(path:string,options:RequestOptions={},method='GET')=>{
 const entry=EXECUTION_ROUTES.find(r=>r.path===path&&r.method===method);
 if(!entry?.frontendReady||entry.responseEnvelope==='SSE')throw new Error('This route is unavailable through the JSON client.');
 const route:ApiRoute={...entry,responseEnvelope:'enveloped'};
 const result=await client.request<Record<string,unknown>|Record<string,unknown>[]>(route,options);
 if(!result.ok)throw new Error(`${result.problem.code}: ${result.problem.title}${result.problem.requestId?' · '+result.problem.requestId:''}`);
 return result;
};}
export type RunEvent={schemaVersion:1;eventId:string;runId:string;sequence:string;type:string;payload:Record<string,unknown>;occurredAt:string;traceId:string};
export function decodeEvent(data:string,runId:string,last:string):RunEvent|null{
 const event=JSON.parse(data) as RunEvent;
 if(event.schemaVersion!==1||event.runId!==runId||!isUuid(event.eventId)||!/^\d+$/.test(event.sequence))throw new Error('Invalid run event.');
 if(BigInt(event.sequence)<=BigInt(last))return null;
 if(BigInt(event.sequence)!==BigInt(last)+BigInt(1))throw new Error('Event sequence gap; reload the run.');
 return event;
}
/** Fetch streaming preserves HTTP 401/410, which native EventSource hides. */
export async function streamRun(runId:string,after:string,signal:AbortSignal,onEvent:(event:RunEvent)=>void,transport:typeof fetch=fetch){
 if(!isUuid(runId)||!/^\d+$/.test(after))throw new Error('Invalid event subscription.');
 const response=await transport(`/api/v1/runs/${encodeURIComponent(runId)}/events?after=${after}`,{credentials:'include',signal,headers:{Accept:'text/event-stream'}});
 if(response.status===410)throw new Error('EVENT_CURSOR_EXPIRED');
 if(response.status===401)throw new Error('OWNER_DISCONNECTED');
 if(!response.ok||!response.body)throw new Error('EVENT_STREAM_UNAVAILABLE');
 const reader=response.body.getReader();const decoder=new TextDecoder();let pending='',cursor=after;
 try{while(!signal.aborted){const part=await reader.read();if(part.done)break;pending+=decoder.decode(part.value,{stream:true});if(pending.length>1048576)throw new Error('Event frame exceeds the stream limit.');let boundary;
  while((boundary=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,boundary);pending=pending.slice(boundary+2);const data=frame.split('\n').filter(line=>line.startsWith('data: ')).map(line=>line.slice(6)).join('\n');if(!data)continue;const event=decodeEvent(data,runId,cursor);if(event){cursor=event.sequence;onEvent(event);}}
 }}finally{await reader.cancel();}
 return cursor;
}
