import fs from 'node:fs';
import {open} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createRequire} from 'node:module';
export class ProtocolError extends Error {}
export class UnsupportedFeature extends ProtocolError {}
export function integer(n:unknown,label:string,min:number,max:number):asserts n is number {
 if(typeof n!=='number'||!Number.isInteger(n)||n<min||n>max)throw new TypeError(`${label} must be an integer ${min}..${max}`);
}
export function parameters(raw:Buffer,min:number,label:string){if(!Buffer.isBuffer(raw)||raw.length<min||raw.length>16)throw new ProtocolError(`Malformed ${label} reply`);return raw;}
export function packet(device:number,feature:number,fn:number,params=Buffer.alloc(0),long=false,software=11){
 integer(device,'device index',0,255);integer(feature,'feature',0,255);integer(fn,'function',0,15);integer(software,'software ID',1,15);
 if(params.length>16)throw new RangeError('At most16 parameter bytes');const size=long||params.length>3?20:7;
 const b=Buffer.alloc(size);b.set([size===20?17:16,device,feature,(fn<<4)|software]);params.copy(b,4);return b;
}
export function responseData(raw:Buffer,request:Buffer){
 if(![7,20].includes(raw.length)||raw[0]!== (raw.length===7?16:17)||raw[1]!==request[1])return null;
 if([143,255].includes(raw[2])&&raw[3]===request[2]&&raw[4]===request[3])throw new ProtocolError(`HID++ error 0x${raw[5].toString(16)}`);
 return raw[2]===request[2]&&raw[3]===request[3]?raw.subarray(4):null;
}
export interface Transport {exchange(packet:Buffer):Promise<Buffer>}
export function nativeInput(){try{return createRequire(import.meta.url)('../../native/linux_input.node');}catch(e){throw new Error(`Native Linux input bridge unavailable. Run npm run build:native. ${String(e)}`);}}
export class HidrawTransport implements Transport{
 path:string; timeout:number; handle:any=null; tail:Promise<unknown>=Promise.resolve();
 constructor(path:string,timeout=1500){this.path=path;this.timeout=timeout;}
 async open(){this.handle=await open(this.path,fs.constants.O_RDWR|fs.constants.O_NONBLOCK|fs.constants.O_CLOEXEC);try{nativeInput().lock(this.handle.fd);}catch(e){await this.handle.close();this.handle=null;throw e;}return this;}
 async close(){if(this.handle){await this.tail;await this.handle.close();this.handle=null;}}
 exchange(request:Buffer):Promise<Buffer>{const work=this.tail.then(()=>this.perform(request));this.tail=work.catch(()=>{});return work;}
 async perform(request:Buffer){if(!this.handle)throw new Error('Transport closed');const sent=await this.handle.write(request,0,request.length,null);if(sent.bytesWritten!==request.length)throw new ProtocolError('Partial HID write');const deadline=Date.now()+this.timeout;
 while(Date.now()<deadline){const b=Buffer.alloc(64);try{const {bytesRead}=await this.handle.read(b,0,b.length,null);if(!bytesRead)throw new ProtocolError('Device disconnected');const r=responseData(b.subarray(0,bytesRead),request);if(r)return r;}catch(e:any){if(e.code!=='EAGAIN'&&e.code!=='EWOULDBLOCK')throw e;}await delay(2);}
 throw new ProtocolError('HID++ reply timed out; verify interface/index and awake device');}
}
export class Mouse{
 transport:Transport;deviceIndex:number;long:boolean;features=new Map<number,Buffer>();version:string|null=null;
 constructor(transport:Transport,index=255,long=false){integer(index,'device index',0,255);this.transport=transport;this.deviceIndex=index;this.long=long;}
 async query(feature:number,fn:number,params=Buffer.alloc(0)){return parameters(await this.transport.exchange(packet(this.deviceIndex,feature,fn,params,this.long)),3,'HID++');}
 async feature(id:number){if(!this.features.has(id)){integer(id,'feature ID',0,65535);const b=Buffer.alloc(2);b.writeUInt16BE(id);this.features.set(id,await this.query(0,0,b));}return this.features.get(id)!;}
 async requireFeature(id:number){const r=await this.feature(id);if(!r[0]||r[1]&128)throw new UnsupportedFeature(`Feature0x${id.toString(16)} unavailable/obsolete`);return r[0];}
 async handshake(){if(!this.version){const r=await this.query(0,1,Buffer.from([0,0,167]));if(r[2]!==167||r[0]<2||r[0]>4)throw new ProtocolError('Unsupported HID++ handshake');this.version=`${r[0]}.${r[1]}`;}return this.version;}
 async inspect(){const protocol=await this.handshake(),index=await this.requireFeature(1),count=(await this.query(index,0))[0],features=[];for(let n=1;n<=count;n++){const r=await this.query(index,1,Buffer.from([n]));features.push({index:n,id:`0x${r.readUInt16BE(0).toString(16).padStart(4,'0')}`,flags:r[2]});}return {protocol,device_index:this.deviceIndex,features};}
}
