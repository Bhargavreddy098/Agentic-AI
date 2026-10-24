import { createClient, type RequestOptions } from './client.ts';
import { findRoute } from './manifest.ts';
import { recordRows, isUuid } from './workbench.ts';
export type WorkspaceRecord = Record<string, unknown>;
/** One reviewed first-message action; stable sub-command keys make partial retries safe. */
export async function saveFirstMessage(api:ReturnType<typeof workspaceApi>,projectId:string,text:string,attachmentIds:string[],key:string){
 const body=messageBody(text,attachmentIds);
 const operation=(step:string)=>({id:key+step,idempotencyKey:key+step});
 let project=projectId;
 if(!project){const result=await api('/projects',{body:{name:'Personal',kind:'greenfield'},operation:operation('.project')},'POST');project=String((result.data as WorkspaceRecord).id);}
 const result=await api('/projects/:projectId/conversations',{pathParams:{projectId:project},body:{title:text.trim().split('\n')[0].slice(0,200)},operation:operation('.conversation')},'POST');
 const conversation=result.data as WorkspaceRecord;
 await api('/conversations/:conversationId/messages',{pathParams:{conversationId:String(conversation.id)},body,operation:operation('.message')},'POST');
 return conversation;
}
export function orderedMessages(data: unknown): WorkspaceRecord[] { return [...(recordRows(data) ?? [])].sort((a, b) => { const x = BigInt(String(a.sequence ?? 0)), y = BigInt(String(b.sequence ?? 0)); return x < y ? -1 : x > y ? 1 : 0; }); }
export function messageBody(text: string, attachmentIds: string[]) { if (!text.trim() || text.length > 32000)
    throw new Error('Enter a message of 1–32,000 characters.'); if (attachmentIds.length > 10 || attachmentIds.some(id => !isUuid(id)))
    throw new Error('Choose up to 10 project artifact references.'); return { text, ...(attachmentIds.length ? { attachmentIds } : {}) }; }
export function workspaceApi(client: ReturnType<typeof createClient>) { return async (path: string, options: RequestOptions = {}, method = 'GET') => { const route = findRoute(method, path); if (!route)
    throw new Error('This capability is not available in the current backend.'); const response = await client.request<unknown>(route, options); if (!response.ok)
    throw new Error(`${response.problem.code}: ${response.problem.title}${response.problem.detail ? ' — ' + response.problem.detail : ''}${response.problem.requestId ? ' · Request ' + response.problem.requestId : ''}${method !== 'GET' ? ' If the outcome is uncertain, reload before submitting again.' : ''}`); return response; }; }
