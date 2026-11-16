import fs from 'node:fs/promises';import {ProtocolError} from './protocol.ts';import type{Transport}from'./protocol.ts';
export class Recording implements Transport{
 transport:Transport;rows:any[]=[];constructor(transport:Transport){this.transport=transport;}
 async exchange(request:Buffer){try{const reply=await this.transport.exchange(request);this.rows.push({request:request.toString('hex'),parameters:reply.toString('hex')});return reply;}catch(e){this.rows.push({request:request.toString('hex'),error:e instanceof Error?e.name:'Error',message:String(e)});throw e;}}
 document(){return {format:'lghub-linux-hidpp',version:1,hardware_validated:false,exchanges:this.rows};}
 async save(path:string){await fs.writeFile(path,JSON.stringify(this.document(),null,2)+'\n',{flag:'wx',mode:384});}
}
export class Replay implements Transport{
 rows:any[];position=0;constructor(source:any){if(!source||source.format!=='lghub-linux-hidpp'||source.version!==1||!Array.isArray(source.exchanges)||source.exchanges.length>10000)throw new TypeError('Unsupported transcript');this.rows=structuredClone(source.exchanges);for(const r of this.rows){const hex=(x:any)=>typeof x==='string'&&/^(?:[0-9a-fA-F]{2})*$/.test(x);if(!hex(r.request))throw new TypeError('Bad requesthex');const q=Buffer.from(r.request,'hex');if(![7,20].includes(q.length)||q[0]!== (q.length===7?16:17))throw new TypeError('Bad packet');if(r.parameters!==undefined&&(!hex(r.parameters)||![3,16].includes(r.parameters.length/2)))throw new TypeError('Bad parameters');if(r.parameters===undefined&&typeof r.error!=='string')throw new TypeError('Missing reply');}}
 async exchange(request:Buffer){const row=this.rows[this.position];if(!row)throw new ProtocolError('Replay exhausted');if(row.request.toLowerCase()!==request.toString('hex'))throw new ProtocolError(`Replay mismatch at${this.position}`);this.position++;if(row.error)throw new ProtocolError(`Recorded ${row.error}: ${row.message??''}`);return Buffer.from(row.parameters,'hex');}
 assertFinished(){if(this.position!==this.rows.length)throw new ProtocolError('Unused replay exchanges');}
 static async load(path:string){const info=await fs.stat(path);if(info.size>4*1024*1024)throw new TypeError('Transcript too large');return new Replay(JSON.parse(await fs.readFile(path,'utf8')));}
}
