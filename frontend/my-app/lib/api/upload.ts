import {findRoute} from './manifest.ts';
import {createClient} from './client.ts';
export async function uploadFile(client:ReturnType<typeof createClient>,projectId:string,file:{name:string;type:string;size:number;arrayBuffer:()=>Promise<ArrayBuffer>}) {
 if(!/^[a-f0-9-]{36}$/i.test(projectId))throw new Error('Select a valid project UUID.');
 if(file.size>16777216)throw new Error('File exceeds the 16 MiB upload limit.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.byteLength!==file.size)throw new Error('Selected file changed while reading.');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const call=async(path:string,method:string,opts:Record<string,unknown>)=>{
  const route=findRoute(method,path);if(!route)throw new Error('Upload route is unavailable.');
  const result=await client.request<Record<string,unknown>>(route,opts);if(!result.ok)throw new Error(result.problem.code+': '+result.problem.detail);return result;
 };
 const staged=await call('/projects/:projectId/uploads','POST',{pathParams:{projectId},body:{filename:file.name,mediaType:file.type||'application/octet-stream',bytes:String(bytes.length),digest}});
 const uploadId=String(staged.data?.id);
 await call('/uploads/:uploadId/content','PUT',{pathParams:{uploadId},rawBody:bytes});
 return call('/uploads/:uploadId/complete','POST',{pathParams:{uploadId},body:{digest}});
}
