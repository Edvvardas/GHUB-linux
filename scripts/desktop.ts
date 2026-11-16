import {spawn} from 'node:child_process';
import {createServer} from '../src/server.ts';
const app=await createServer(undefined,Number(process.env.LGHUB_PORT??8765));
const url=await app.listen();
console.log('G HUB Linux:',url);
const executable=process.env.LGHUB_ELECTRON??process.env.LGHUB_BROWSER??'chromium';
const args=process.env.LGHUB_ELECTRON?[process.env.LGHUB_SHELL!,url]:[`--app=${url}`,'--class=ghub-linux-ts'];
const browser=spawn(executable,args,{stdio:'inherit'});
let closing=false;async function stop(){if(closing)return;closing=true;await app.close();process.exit(0);}
browser.once('error',async error=>{console.error('Browser launch failed:',error.message,'Open',url,'in your browser. The service is still running.');});
browser.once('exit',()=>{void stop();});process.on('SIGINT',()=>{browser.kill('SIGTERM');void stop();});process.on('SIGTERM',()=>{browser.kill('SIGTERM');void stop();});
