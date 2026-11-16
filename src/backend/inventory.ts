import fs from 'node:fs/promises';import {constants} from 'node:fs';import path from 'node:path';
async function accessible(p:string,mode:number){try{await fs.access(p,mode);return true;}catch{return false;}}
export async function inventory(sys='/sys/class/hidraw',dev='/dev'){
 const result:any[]=[];for(const name of await fs.readdir(sys).catch(()=>[])){if(!/^hidraw\d+$/.test(name))continue;try{const values=Object.fromEntries((await fs.readFile(path.join(sys,name,'device/uevent'),'utf8')).trim().split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));const ids=values.HID_ID.split(':').map(s=>parseInt(s,16));if(ids[1]!==0x046d)continue;const p=path.join(dev,name);result.push({path:p,name:values.HID_NAME,vendor:'046d',product:ids[2].toString(16).padStart(4,'0'),bus:ids[0],physical_path:values.HID_PHYS,node_exists:await accessible(p,constants.F_OK),accessible:await accessible(p,constants.R_OK|constants.W_OK)});}catch{}}
 return result.sort((a,b)=>a.path.localeCompare(b.path));
}
function bitmap(s:string){return s.trim().split(/\s+/).reverse().reduce((v,w,i)=>v|(BigInt('0x'+w)<<BigInt(64*i)),0n);}
export async function listMouseInputs(sys='/sys/class/input',dev='/dev/input'){
 const {BUTTON_CODES}=await import('../shared/keys.ts');const rows:any[]=[];
 for(const name of await fs.readdir(sys).catch(()=>[])){if(!/^event\d+$/.test(name))continue;const base=path.join(sys,name,'device');try{const [vendor,product,label,keys,rel,real]=await Promise.all([fs.readFile(base+'/id/vendor','utf8'),fs.readFile(base+'/id/product','utf8'),fs.readFile(base+'/name','utf8'),fs.readFile(base+'/capabilities/key','utf8'),fs.readFile(base+'/capabilities/rel','utf8'),fs.realpath(base)]);if(parseInt(vendor,16)!==0x046d||label.startsWith('LGHUB Linux Virtual')||real.includes('/virtual/input/'))continue;const k=bitmap(keys),r=bitmap(rel);if(!(k&(1n<<272n))||(r&3n)!==3n)continue;const p=path.join(dev,name);rows.push({path:p,name:label.trim(),vendor:'046d',product:product.trim(),buttons:Object.entries(BUTTON_CODES).filter(([,code])=>!!(k&(1n<<BigInt(code)))).map(([name])=>name),node_exists:await accessible(p,constants.F_OK),accessible:await accessible(p,constants.R_OK)});}catch{}}
 return rows;
}
