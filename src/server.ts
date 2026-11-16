import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {Service} from './service.ts';

const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
export async function createServer(service:any=new Service(),port=8765){
 const token=randomBytes(32).toString('hex');
 await service.init();
 const server=http.createServer(async(req,res)=>{
  const host=req.headers.host??'',address=server.address();const actualPort=typeof address==='object'&&address?address.port:port;
  const allowed=new Set([`127.0.0.1:${actualPort}`,`localhost:${actualPort}`]);
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(!allowed.has(host)){json(403,{error:'Local host header required'});return;}
  const url=new URL(req.url??'/',`http://${host}`);
  try{
   if(url.pathname.startsWith('/api/')){
    if(req.method==='GET'){
     if(url.pathname==='/api/session'){json(200,{token});return;}
     if(url.pathname==='/api/state'){json(200,await service.state());return;}
     if(url.pathname==='/api/memory'){json(200,await service.queue(()=>service.memory()));return;}
     if(url.pathname.startsWith('/api/profiles/')){json(200,await service.store.profile(decodeURIComponent(url.pathname.slice(14))));return;}
     json(404,{error:'Unknown API endpoint'});return;
    }
    if(req.method!=='POST'){json(405,{error:'POST required'});return;}
    const origin=req.headers.origin;
    const supplied=String(req.headers['x-ghub-token']??'');
    if((origin&&origin!==`http://${host}`)||req.headers['sec-fetch-site']==='cross-site'||Buffer.byteLength(supplied)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){json(403,{error:'Same-origin application session required'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:'JSON required'});return;}
    const chunks:Buffer[]=[];let length=0;
    for await(const chunk of req){length+=chunk.length;if(length>1048576){json(413,{error:'Request exceeds 1 MiB'});return;}chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
    const route=({
     '/api/select':()=>service.select(body), '/api/refresh':()=>service.refresh(),
     '/api/settings':()=>service.changeSettings(body), '/api/assignments':()=>service.saveAssignments(body.config), '/api/onboard/assignments':()=>service.saveOnboard(body.config),
     '/api/runtime/start':()=>service.startRuntime(body), '/api/runtime/stop':()=>service.stopRuntime(),
     '/api/profiles/save':()=>service.saveProfile(body), '/api/profiles/apply':()=>service.applyProfile(body.name),
     '/api/profiles/delete':async()=>{await service.store.deleteProfile(body.name);return service.state();},
    } as Record<string,()=>Promise<unknown>>)[url.pathname];
    if(!route){json(404,{error:'Unknown API endpoint'});return;}
    json(200,await service.queue(route));return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){json(405,{error:'GET required'});return;}
   const pathname=decodeURIComponent(url.pathname);
   const source=pathname.startsWith('/src/renderer/')||pathname.startsWith('/src/shared/');
   const base=source?ROOT:path.join(ROOT,'public');
   const target=path.resolve(base,pathname==='/'?'index.html':'.'+pathname);
   if(!target.startsWith(base+path.sep)){json(403,{error:'Invalid path'});return;}
   const data=await fs.readFile(target);let output:Buffer|string=data;
   let mime=({'html':'text/html','css':'text/css','js':'text/javascript','svg':'image/svg+xml','png':'image/png','woff':'font/woff','woff2':'font/woff2','ttf':'font/ttf'} as Record<string,string>)[path.extname(target).slice(1)]??'application/octet-stream';
   if(target.endsWith('.ts')){output=stripTypeScriptTypes(data.toString('utf8'),{mode:'strip',sourceUrl:pathname});mime='text/javascript';}
   res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?'':output);
  }catch(error:any){
   if(url.pathname==='/api/settings'||url.pathname==='/api/profiles/apply')service.settings=null;
   json(error.code==='ENOENT'?404:400,{error:error.message??String(error),runtime:service.runtime?.snapshot()??{state:'stopped'}});
  }
 });
 return {server,service,token,async listen(){await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});const a=server.address() as any;return `http://127.0.0.1:${a.port}`;},async close(){server.closeIdleConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await service.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.LGHUB_PORT??8765);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid LGHUB_PORT');
 const app=await createServer(undefined,port);const url=await app.listen();console.log(`G HUB Linux TypeScript: ${url}`);
 let closing=false;const stop=async()=>{if(closing)return;closing=true;await app.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
