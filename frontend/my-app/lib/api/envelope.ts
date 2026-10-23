import type { EnvelopeShape,ApiResult } from './types.ts';
type Meta=Extract<ApiResult<unknown>,{ok:true}>['meta'];
export async function unwrapEnvelope(shape:EnvelopeShape,response:{json?:()=>Promise<unknown>;arrayBuffer?:()=>Promise<ArrayBuffer>;status:number}) : Promise<{data:unknown;meta?:Meta}> {
 if(shape==='none')return {data:null};
 if(shape==='bytes')return {data:response.arrayBuffer?await response.arrayBuffer():null};
 const body=response.json?await response.json():null;
 if(shape==='enveloped'){if(!body||typeof body!=='object')throw new Error('Invalid API envelope');const value=body as {data:unknown;meta?:Meta};return {data:value.data,meta:value.meta};}
 return {data:body};
}
