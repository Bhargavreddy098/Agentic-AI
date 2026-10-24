import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeEvent,executionApi,streamRun,EXECUTION_ROUTES} from '../lib/api/execution.ts';
import {createClient} from '../lib/api/client.ts';
const runId='11111111-1111-4111-8111-111111111111';
const eventId='22222222-2222-4222-8222-222222222222';
const event=sequence=>({schemaVersion:1,runId,eventId,sequence,type:'run.state_changed',payload:{state:'executing'}});
test('Stage 07 event decoder rejects cross-run data, gaps and malformed sequence; ignores replay',()=>{
 assert.equal(decodeEvent(JSON.stringify(event('4')),runId,'4'),null);
 assert.equal(decodeEvent(JSON.stringify(event('9007199254740993')),runId,'9007199254740992').sequence,'9007199254740993');
 assert.throws(()=>decodeEvent(JSON.stringify(event('6')),runId,'4'));
 assert.throws(()=>decodeEvent(JSON.stringify({...event('5'),runId:eventId}),runId,'4'));
 assert.throws(()=>decodeEvent(JSON.stringify(event('NaN')),runId,'4'));
});
test('Stage 07 streaming decodes split frames and exposes expired cursors',async()=>{
 const data=new TextEncoder().encode(`: heartbeat\n\nid: 5\nevent: run.state_changed\ndata: ${JSON.stringify(event('5'))}\n\n`);let count=0;
 const transport=async(url,init)=>{assert.match(url,/after=4$/);assert.equal(init.credentials,'include');return new Response(new ReadableStream({start(controller){controller.enqueue(data.slice(0,30));controller.enqueue(data.slice(30));controller.close();}}));};
 assert.equal(await streamRun(runId,'4',new AbortController().signal,e=>{assert.equal(e.sequence,'5');count++;},transport),'5');assert.equal(count,1);
 await assert.rejects(streamRun(runId,'4',new AbortController().signal,()=>{},async()=>new Response(null,{status:410})),/EVENT_CURSOR_EXPIRED/);
});
test('Stage 07 JSON transport preserves command identity and refuses public start or SSE misuse',async()=>{
 let calls=0;const api=executionApi(createClient({getCsrfToken:()=> 'csrf',transport:async(url,init)=>{calls++;assert.equal(url,`/api/v1/runs/${runId}/cancel`);assert.equal(init.headers['Idempotency-Key'],'command');assert.equal(init.headers['X-CSRF-Token'],'csrf');return new Response(JSON.stringify({data:{state:'cancelling'},meta:{requestId:'test'}}),{status:202});}}));
 const result=await api('/runs/:runId/cancel',{pathParams:{runId},body:{reason:'owner request'},operation:{id:'command',idempotencyKey:'command'}},'POST');assert.equal(result.data.state,'cancelling');
 await assert.rejects(api('/goals/:goalId/runs',{},'POST'));await assert.rejects(api('/runs/:runId/events'));assert.equal(calls,1);assert.equal(EXECUTION_ROUTES.length,12);
});
