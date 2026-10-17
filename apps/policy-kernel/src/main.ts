import { createServer, type Server } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { z } from 'zod';
import { EffectRequestSchema, UtcTimestampSchema, OpaqueIdSchema } from '@asi/contracts';
import { createPolicyService, loadPolicyConfig } from '@asi/policy';
import { configureIdentity, verifyPrincipal, setGrantStore, PostgresGrantStore } from '@asi/identity';

export interface PolicyKernelConfig { port:number; configPath:string; signingKey:Uint8Array; transportKey:Uint8Array; pool:Pool; ownerId:string; host?:'127.0.0.1'|'0.0.0.0' }
const messageSchema=z.strictObject({operation:z.enum(['authorize','issue','validate','createApproval','approve','reject','consume','get','list']),timestamp:UtcTimestampSchema,effectRequest:EffectRequestSchema,approvalId:OpaqueIdSchema.optional(),nonce:OpaqueIdSchema.optional(),token:z.string().min(1).max(65536).optional(),reason:z.string().min(1).max(1024).optional()});
function bearer(value:string|undefined):string {if(!value?.startsWith('Bearer ')||value.length>16384)throw new Error('Authenticated bearer required');return value.slice(7);}
function signed(key:Uint8Array,body:string):string {return createHmac('sha256',key).update(body).digest('hex');}
function verified(key:Uint8Array,body:string,signature:unknown):boolean {if(typeof signature!=='string'||! /^[a-f0-9]{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signed(key,body),'hex'),Buffer.from(signature,'hex'));}
export async function startPolicyKernel(config:PolicyKernelConfig):Promise<Server>{
  if(!config.pool||!config.ownerId||config.signingKey.length<32||config.transportKey.length<32||Buffer.from(config.signingKey).equals(Buffer.from(config.transportKey))||!Number.isInteger(config.port)||config.port<0||config.port>65535)throw new Error('Complete trusted kernel configuration required');
  await loadPolicyConfig(config.configPath);
  const server=createServer(async(req,res)=>{
    const reply=(status:number,value:unknown)=>{const body=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json','x-signature':signed(config.transportKey,body)});res.end(body);};
    try{
      if(req.method!=='POST'||req.url!=='/'){reply(405,{error:'Unsupported policy operation'});return;}
      if(Number(req.headers['content-length']??0)>65536){reply(413,{error:'Policy request exceeds bound'});req.resume();return;}
      let size=0;const chunks:Buffer[]=[];
      for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>65536){reply(413,{error:'Policy request exceeds bound'});req.resume();return;}chunks.push(bytes);}
      const body=Buffer.concat(chunks).toString('utf8');
      if(!verified(config.transportKey,body,req.headers['x-signature'])){reply(401,{error:'Invalid policy transport authentication'});return;}
      const message=messageSchema.parse(JSON.parse(body));
      if(Math.abs(Date.now()-Date.parse(message.timestamp))>30000)throw new Error('Expired transport request');
      const principal=await verifyPrincipal(bearer(req.headers.authorization),'policy-kernel');
      const service=await createPolicyService({pool:config.pool,tenantId:principal.tenantId,ownerId:config.ownerId,context:message.effectRequest.runContext,principal,signingKey:config.signingKey,transportKey:config.transportKey,tokenTtlMs:30000,loadPolicy:()=>loadPolicyConfig(config.configPath)});
      const id=()=>OpaqueIdSchema.parse(message.approvalId),nonce=()=>OpaqueIdSchema.parse(message.nonce);
      switch(message.operation){
        case 'authorize':reply(200,{decision:await service.authorizeEffect(message.effectRequest,principal)});break;
        case 'issue':reply(200,{token:await service.issueExecutionCapability(message.effectRequest)});break;
        case 'validate':await service.validateExecutionCapability(z.string().parse(message.token),message.effectRequest);reply(200,{valid:true});break;
        case 'createApproval':{const approver=await verifyPrincipal(bearer(typeof req.headers['x-approver-authorization']==='string'?req.headers['x-approver-authorization']:undefined),'policy-kernel');reply(200,await service.createApproval(message.effectRequest,approver));break;}
        case 'approve':{const a=await service.getApproval(id());if(!a)throw new Error('Unknown approval');await service.approveEffect({schemaVersion:1,approvalId:id(),nonce:nonce(),approver:principal,effectId:message.effectRequest.effectId,inputHash:message.effectRequest.inputHash,policyVersion:a.policyVersion,expiresAt:a.expiresAt});reply(200,{approved:true});break;}
        case 'reject':await service.rejectApproval(id(),nonce(),principal,z.string().min(1).max(1024).parse(message.reason));reply(200,{rejected:true});break;
        case 'consume':reply(200,{token:await service.consumeApproval(id(),nonce(),message.effectRequest)});break;
        case 'get':reply(200,{approval:await service.getApproval(id())});break;
        case 'list':reply(200,{approvals:await service.listPending()});break;
      }
    }catch{if(!res.headersSent)reply(403,{error:'Policy authorization unavailable or denied'});else res.destroy();}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxHeadersCount=32;
  await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(config.port,config.host??'127.0.0.1',()=>{server.off('error',reject);done();});});return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const required=(name:string)=>{const value=process.env[name];if(!value)throw new Error('Missing trusted policy configuration: '+name);return value;};
  try{
    configureIdentity(JSON.parse(required('IDENTITY_SIGNING_CONFIG')));
    const identityPool=new Pool({connectionString:required('IDENTITY_DATABASE_URL'),options:process.env['IDENTITY_PGOPTIONS'],max:4,connectionTimeoutMillis:3000,statement_timeout:3000});setGrantStore(new PostgresGrantStore(identityPool));
    const pool=new Pool({connectionString:required('POLICY_DATABASE_URL'),max:8,connectionTimeoutMillis:3000,statement_timeout:3000});
    const key=(name:string)=>Buffer.from(readFileSync(required(name))); // File-backed secrets require protected Windows filesystem permissions.
    const envKey=(name:string)=>process.env[name+'_FILE']?key(name+'_FILE'):Buffer.from(required(name),'base64');
    const server=await startPolicyKernel({port:Number(required('POLICY_KERNEL_PORT')),configPath:required('POLICY_CONFIG_PATH'),ownerId:required('POLICY_KERNEL_OWNER_ID'),signingKey:envKey('POLICY_SIGNING_KEY'),transportKey:envKey('POLICY_TRANSPORT_KEY'),pool,host:process.env['POLICY_KERNEL_HOST']==='0.0.0.0'?'0.0.0.0':'127.0.0.1'});
    const address=server.address();if(!address||typeof address==='string')throw new Error('Invalid policy listener');console.log('POLICY_KERNEL_READY '+address.port);
    const close=()=>{server.closeAllConnections();server.close(()=>{void Promise.all([pool.end(),identityPool.end()]).then(()=>process.exit(0));});};process.once('SIGTERM',close);process.once('SIGINT',close);
  }catch{console.error('Policy kernel startup failed: trusted configuration or dependency unavailable');process.exitCode=1;}
}
