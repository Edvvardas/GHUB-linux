import fs from 'node:fs/promises';
import {constants as C} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {validateConfig} from './shared/config.ts';

export class Store {
 root:string;
 constructor(root=path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'lghub-linux-ts')){this.root=path.resolve(root);}
 async directory(relative:string,create=false){
  const target=path.join(this.root,relative);let handle=await fs.open('/',C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);
  try{
   for(const component of target.split('/').filter(Boolean)){
    const next=`/proc/self/fd/${handle.fd}/${component}`;
    if(create)await fs.mkdir(next,{mode:0o700}).catch((e:any)=>{if(e.code!=='EEXIST')throw e;});
    const child=await fs.open(next,C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);await handle.close();handle=child;
   }
   return handle;
  }catch(e){await handle.close();throw e;}
 }
 name(name:string){if(typeof name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(name)||name.trim()!==name)throw new Error('Use a profile name of 1–64 letters, numbers, spaces, - or _');return name+'.json';}
 async read(relative:string,filename:string){
  const d=await this.directory(relative);try{const f=await fs.open(`/proc/self/fd/${d.fd}/${filename}`,C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);try{const st=await f.stat();if(!st.isFile()||st.size>1048576)throw new Error('Invalid or oversized JSON document');return JSON.parse(await f.readFile('utf8'));}finally{await f.close();}}finally{await d.close();}
 }
 async write(relative:string,filename:string,document:unknown,overwrite=false){
  const bytes=JSON.stringify(document,null,2)+'\n';if(Buffer.byteLength(bytes)>1048576)throw new Error('Document exceeds 1 MiB');
  const d=await this.directory(relative,true),base=`/proc/self/fd/${d.fd}`,temporary=base+'/.new-'+randomUUID(),target=base+'/'+filename;
  try{
   try{const s=await fs.lstat(target);if(!s.isFile())throw new Error('Document is not a regular file');if(!overwrite)throw new Error('A profile with this name already exists');}catch(e:any){if(e.code!=='ENOENT')throw e;}
   const file=await fs.open(temporary,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);
   try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
   if(overwrite)await fs.rename(temporary,target);else await fs.link(temporary,target);
   await d.sync();
  }finally{await fs.unlink(temporary).catch(()=>{});await d.close();}
 }
 async assignments(){try{return validateConfig(await this.read('','assignments.json'));}catch(e:any){if(e.code==='ENOENT')return {schema_version:1 as const,bindings:{}};throw e;}}
 async saveAssignments(config:unknown){const normalized=validateConfig(config);await this.write('','assignments.json',normalized,true);return normalized;}
 async profiles(){let d;try{d=await this.directory('profiles');}catch(e:any){if(e.code==='ENOENT')return [];throw e;}
  try{const names=[];for(const entry of await fs.readdir(`/proc/self/fd/${d.fd}`,{withFileTypes:true})){if(entry.name.endsWith('.json')){this.name(entry.name.slice(0,-5));if(!entry.isFile())throw new Error('Profile is not a regular file');names.push(entry.name.slice(0,-5));}}return names.sort();}finally{await d.close();}}
 async profile(name:string){return this.read('profiles',this.name(name));}
 async saveProfile(name:string,profile:unknown,overwrite=false){await this.write('profiles',this.name(name),profile,overwrite);}
 async deleteProfile(name:string){const d=await this.directory('profiles');try{const p=`/proc/self/fd/${d.fd}/${this.name(name)}`;if(!(await fs.lstat(p)).isFile())throw new Error('Profile is not a regular file');await fs.unlink(p);await d.sync();}finally{await d.close();}}
}
