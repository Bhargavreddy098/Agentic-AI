// @ts-check
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {LOCAL_SESSION_COOKIE} from '../../http/identity.routes.js';

/** Native-only launcher port. The handoff URL must never be logged or exposed by an API. */
export async function createLocalGateway({identity,scope,frontendOrigin,allowedOrigins,ttlMs=60000}){
 const frontend=new URL(frontendOrigin);
 if(frontend.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(frontend.hostname)||frontend.origin!==frontendOrigin||!allowedOrigins.includes(frontendOrigin))throw new Error('Gateway requires an allowlisted loopback frontend origin');
 if(!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>120000)throw new Error('Invalid gateway lifetime');
 const proof=await identity.issueChallenge({...scope,ttlMs});
 const ticket=randomBytes(32).toString('base64url');
 let consumed=false,closed=false,timer;let finish;
 const completion=new Promise(resolve=>{finish=resolve;});
 const deadline=Date.now()+ttlMs;
 let expectedHost='';
 const server=createServer((req,res)=>{void handle(req,res);});
 server.requestTimeout=5000;server.headersTimeout=5000;
 async function handle(req,res){
  res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');res.setHeader('content-security-policy',"default-src 'none'; frame-ancestors 'none'");res.setHeader('x-content-type-options','nosniff');
  const deny=(status)=>{res.writeHead(status,{'content-type':'text/plain; charset=utf-8'});res.end('Local gateway handoff unavailable. Start the gateway again.');};
  try{
   if(req.headers.host!==expectedHost||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??''))return deny(403);
   if(req.headers.origin!==undefined&&req.headers.origin!==frontendOrigin)return deny(403);
   if(req.method!=='GET')return deny(405);
   const candidate=/^\/handoff\/([A-Za-z0-9_-]{43})$/.exec(req.url??'')?.[1];
   if(!candidate||!timingSafeEqual(Buffer.from(candidate),Buffer.from(ticket)))return deny(404);
   if(consumed)return deny(409);
   if(Date.now()>=deadline)return deny(410);
   consumed=true;
   const result=await identity.bootstrap(proof);
   res.setHeader('set-cookie',`${LOCAL_SESSION_COOKIE}=${result.token}; Path=/api/v1; HttpOnly; SameSite=Strict`);
   res.writeHead(303,{location:frontendOrigin+'/studio'});
   res.once('finish',()=>finish({connected:true}));res.end();
  }catch{deny(503);finish({connected:false});}
 }
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,frontend.hostname.replace(/^\[|\]$/g,''),()=>{server.off('error',reject);resolve(undefined);});});}
 catch{server.close();throw new Error('Local gateway could not bind loopback');}
 const address=server.address();if(!address||typeof address==='string')throw new Error('Local gateway address unavailable');
 expectedHost=frontend.hostname+':'+address.port;
 timer=setTimeout(()=>{finish({connected:false});void close();},ttlMs);
 async function close(){if(closed)return;closed=true;clearTimeout(timer);finish({connected:false});await new Promise(resolve=>{server.close(()=>resolve(undefined));server.closeAllConnections();});}
 return {handoffUrl:`http://${expectedHost}/handoff/${ticket}`,completion,close};
}
