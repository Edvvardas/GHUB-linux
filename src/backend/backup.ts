import fs from 'node:fs/promises';import {constants as C}from'node:fs';import path from'node:path';import{randomUUID}from'node:crypto';
/** Descriptor-anchored no-follow, durable backup. Failure always precedes hardware writes. */
export async function saveBackup(directory:string,record:unknown){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||directory.split('/').includes('..'))throw new TypeError('An absolute backup directory without parent traversal is required');
 const target=path.normalize(directory),bytes=JSON.stringify(record,null,2)+'\n';if(Buffer.byteLength(bytes)>1048576)throw new TypeError('Backup exceeds1MiB');
 let dir=await fs.open('/',C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);
 try{for(const component of target.split('/').filter(Boolean)){const p=`/proc/self/fd/${dir.fd}/${component}`;try{await fs.mkdir(p,{mode:448});}catch(e:any){if(e.code!=='EEXIST')throw e;}const child=await fs.open(p,C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);await dir.close();dir=child;}
 const name=`onboard-binding-${randomUUID()}.json`,file=await fs.open(`/proc/self/fd/${dir.fd}/${name}`,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,384);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}await dir.sync();return path.join(await fs.realpath(`/proc/self/fd/${dir.fd}`),name);
 }finally{await dir.close();}
}
