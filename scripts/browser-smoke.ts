/** Actual Chromium DOM key events -> HTTP API -> saved JSON; no evdev/uinput. */
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as wait} from 'node:timers/promises';
import {createServer} from '../src/server.ts';import {Service} from '../src/service.ts';import {Store} from '../src/store.ts';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'ghub-browser-'));
const service=new Service(new Store(path.join(tmp,'config')));const app=await createServer(service,0);const url=await app.listen();
const chrome=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${tmp}/chrome`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let log='';chrome.stderr.on('data',d=>{log+=d;});let ws:WebSocket|null=null;
try{
 let port='';for(let n=0;n<100;n++){try{port=(await fs.readFile(tmp+'/chrome/DevToolsActivePort','utf8')).split('\n')[0];if(port)break;}catch{}if(chrome.exitCode!==null)throw new Error(log);await wait(100);}
 if(!port)throw new Error('Chromium debugging endpoint unavailable: '+log.slice(-2000));
 const info=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() as any;
 ws=new WebSocket(info.webSocketDebuggerUrl);await new Promise<void>((resolve,reject)=>{ws!.onopen=()=>resolve();ws!.onerror=reject;});
 let id=0;const pending=new Map<number,any>();ws.onmessage=e=>{const d=JSON.parse(String(e.data));if(d.id){const p=pending.get(d.id);pending.delete(d.id);if(d.error)p.reject(new Error(JSON.stringify(d.error)));else p.resolve(d.result);}};
 const send=(method:string,params:any={},sessionId?:string)=>new Promise<any>((resolve,reject)=>{const seq=++id;pending.set(seq,{resolve,reject});ws!.send(JSON.stringify({id:seq,method,params,...(sessionId?{sessionId}:{})}));setTimeout(()=>{if(pending.delete(seq))reject(new Error('CDP timed out: '+method));},10000).unref();});
 const target=await send('Target.createTarget',{url});const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const evaluate=async(expression:string)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async(expression:string)=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await wait(100);}throw new Error('UI condition timed out: '+expression+'\n'+await evaluate('document.body.innerText'));};
 await until('!!document.querySelector("[data-page=assignments]") && !document.body.innerText.includes("Connecting to the local")');
 const screenshotDir=process.env.LGHUB_SCREENSHOT_DIR || new URL('../research/',import.meta.url);
 await fs.mkdir(screenshotDir,{recursive:true});
 await send('Page.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 const shot=async(name:string)=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);await fs.writeFile(typeof screenshotDir==='string'?path.join(screenshotDir,name):new URL(name,screenshotDir),Buffer.from(r.data,'base64'));};
 await shot('typescript-home.png');
 await evaluate('document.querySelector("[data-page=assignments]").click()');
 await until('!!document.querySelector("[data-do=capture-open]")');
 const capture=async(events:any[],expected:string[])=>{
  await evaluate('document.querySelector("[data-do=capture-open]").click();document.querySelector("[data-do=capture-start]").click()');
  for(const event of events)await send('Input.dispatchKeyEvent',event,sessionId);
  await until('!!document.querySelector("[data-do=capture-confirm]:not([disabled])")');
  await evaluate('document.querySelector("[data-do=capture-confirm]").click()');
  await until('!document.querySelector("[data-do=capture-confirm]")');
  const saved=await service.store.assignments();const values=Object.values(saved.bindings) as any[];
  if(!values.some(a=>a.type==='key'&&JSON.stringify(a.keys)===JSON.stringify(expected)))throw new Error('Wrong saved binding: '+JSON.stringify(saved));
 };
 await capture([{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37},{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37}],['KEY_LEFT']);
 await capture([{type:'keyDown',key:'Control',code:'ControlRight',windowsVirtualKeyCode:17,location:2,modifiers:2},{type:'keyDown',key:'1',code:'Numpad1',windowsVirtualKeyCode:97,isKeypad:true,location:3,modifiers:2},{type:'keyUp',key:'1',code:'Numpad1',windowsVirtualKeyCode:97,isKeypad:true,location:3,modifiers:2},{type:'keyUp',key:'Control',code:'ControlRight',windowsVirtualKeyCode:17,location:2}],['KEY_RIGHTCTRL','KEY_KP1']);
 await shot('typescript-assignments.png');
 await evaluate('document.querySelector("[data-page=sensitivity]").click()');
 await until('!!document.querySelector("[data-page=home]:not([disabled])")');
 await shot('typescript-sensitivity.png');
 console.log(JSON.stringify({browser:'Chromium',arrowBinding:['KEY_LEFT'],rightModifierKeypadBinding:['KEY_RIGHTCTRL','KEY_KP1'],savedThroughHttp:true,physicalInputGrabbed:false,linuxInputEventsEmitted:0}));
 await send('Browser.close');
}catch(e){console.error('Browser smoke failed:',e);console.error(log.slice(-3000));process.exitCode=1;}
finally{ws?.close();chrome.kill('SIGTERM');await new Promise<void>(resolve=>{if(chrome.exitCode!==null)resolve();else{chrome.once('exit',()=>resolve());setTimeout(()=>{chrome.kill('SIGKILL');resolve();},3000).unref();}});await app.close();await fs.rm(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
