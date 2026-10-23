import type {ProblemDetails} from './types.ts';
export function parseProblem(status:number,body:unknown):ProblemDetails {
 const b=(body&&typeof body==='object'?body:{}) as Record<string,unknown>;
 const titles:Record<number,string>={400:'BAD_REQUEST',401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',409:'CONFLICT',412:'PRECONDITION_FAILED',429:'RATE_LIMITED',500:'INTERNAL_ERROR',502:'BAD_GATEWAY',503:'DEPENDENCY_UNAVAILABLE'};
 const code=typeof b.code==='string'?b.code:typeof b.title==='string'?b.title:titles[status]??'HTTP_'+status;
 const meta=b.meta as {requestId?:string}|undefined;
 return {code,title:typeof b.title==='string'?b.title:code,status,detail:typeof b.detail==='string'?b.detail:status>=500?'Backend unreachable or returned an unexpected response.':undefined,retryable:typeof b.retryable==='boolean'?b.retryable:status>=500||status===429,requestId:typeof b.requestId==='string'?b.requestId:meta?.requestId};
}
