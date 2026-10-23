import type { ApiRoute, ApiResult, RequestLogRecord } from './types.ts';
import { buildHeaders, beginOperation, type Operation } from './requirements.ts';
import { unwrapEnvelope } from './envelope.ts';
import { parseProblem } from './problem.ts';
import { makeRecord } from './log.ts';
export type RequestOptions={pathParams?:Record<string,string>;query?:Record<string,string>;body?:unknown;rawBody?:Uint8Array|ArrayBuffer;ifMatch?:string;operation?:Operation;signal?:AbortSignal};
type ClientOptions={transport?:typeof fetch;getCsrfToken?:()=>string|null;onUnauthorized?:()=>void;onLog?:(record:RequestLogRecord)=>void;maxRetries?:number};
function buildUrl(route:ApiRoute,opts:RequestOptions){let url=route.canonicalRoute;for(const [key,value] of Object.entries(opts.pathParams??{}))url=url.replace(':'+key,encodeURIComponent(value));if(/:[a-z]/i.test(url))throw new Error('Missing resource identifier');const query=new URLSearchParams(opts.query).toString();return url+(query?'?'+query:'');}
export function createClient({transport=fetch,getCsrfToken=()=>null,onUnauthorized=()=>{},onLog=()=>{},maxRetries=2}:ClientOptions={}){
 return {async request<T=unknown>(route:ApiRoute,opts:RequestOptions={}):Promise<ApiResult<T>>{
  const op=opts.operation??beginOperation(route);
  for(let attempt=0;attempt<=maxRetries;attempt++){
   const start=Date.now();const {headers,refusal}=buildHeaders(route,op,{csrfToken:getCsrfToken(),ifMatch:opts.ifMatch});
   if(refusal)return {ok:false,problem:parseProblem(400,{code:'BAD_REQUEST',title:refusal})};
   const raw=opts.rawBody!==undefined;if(raw)headers['Content-Type']='application/octet-stream';else if(opts.body!==undefined&&!(opts.body instanceof FormData))headers['Content-Type']='application/json';
   try{
    const res=await transport(buildUrl(route,opts),{method:route.method,credentials:'include',headers,body:raw?opts.rawBody as BodyInit:opts.body instanceof FormData?opts.body:opts.body!==undefined?JSON.stringify(opts.body):undefined,signal:opts.signal});
    if(res.status===401){onUnauthorized();return {ok:false,problem:parseProblem(401,{})};}
    if(!res.ok){const problem=parseProblem(res.status,await res.json().catch(()=>({})));onLog(makeRecord({method:route.method,path:route.canonicalRoute,status:res.status,latencyMs:Date.now()-start,requestId:problem.requestId}));if(problem.retryable&&attempt<maxRetries&&op.idempotencyKey&&!opts.signal?.aborted)continue;return {ok:false,problem};}
    const result=await unwrapEnvelope(route.responseEnvelope,res);onLog(makeRecord({method:route.method,path:route.canonicalRoute,status:res.status,latencyMs:Date.now()-start,requestId:res.headers?.get?.('x-request-id')??undefined}));return {ok:true,data:result.data as T,status:res.status,meta:result.meta};
   }catch{if(attempt<maxRetries&&op.idempotencyKey&&!opts.signal?.aborted)continue;return {ok:false,problem:parseProblem(503,{code:'NETWORK_ERROR',title:'Network error',detail:'Request failed. Check backend connectivity before retrying.'})};}
  }
  return {ok:false,problem:parseProblem(503,{code:'NETWORK_ERROR',title:'Network error'})};
 }};
}
