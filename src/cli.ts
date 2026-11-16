import {parseArgs} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import {inventory,listMouseInputs} from './backend/inventory.ts';
import {HidrawTransport,Mouse} from './backend/protocol.ts';
import {Settings,ExtendedDpiSettings,ExtendedRateSettings} from './backend/settings.ts';
import {OnboardSettings,OnboardMemory,OnboardBindings} from './backend/onboard.ts';
import {Recording,Replay} from './backend/recording.ts';
import {captureProfile,applyProfile,identifyTarget} from './backend/profiles.ts';
import {Store} from './store.ts';
import {RemapRuntime} from './backend/remap-runtime.ts';

const {values:v,positionals:p}=parseArgs({allowPositionals:true,options:{
 'device-index':{type:'string',default:'255'},sensor:{type:'string',default:'0'},long:{type:'boolean'},extended:{type:'boolean'},set:{type:'string'},record:{type:'string'},replay:{type:'string'},snapshot:{type:'boolean'},output:{type:'string'},overwrite:{type:'boolean'},directory:{type:'string'},input:{type:'string'},'restore-side-buttons':{type:'boolean'},help:{type:'boolean'}
}});
const store=new Store(v.directory),command=p[0];
const print=(x:unknown)=>console.log(JSON.stringify(x,null,2));
async function run(){
 if(v.help||!command){console.log(`G HUB Linux TypeScript CLI
  list | assignments inputs | assignments show
  assignments run --input /dev/input/eventN
  inspect|status|dpi|rate|battery|onboard|memory /dev/hidrawN --device-index 1
  dpi|rate /dev/hidrawN --device-index 1 --set VALUE [--extended]
  onboard /dev/hidrawN --device-index 1 --set host|onboard
  memory /dev/hidrawN --device-index 1 --snapshot --output NEW.json
  profiles list|show|delete NAME
  profiles capture|apply NAME /dev/hidrawN --device-index 1
  buttons /dev/hidrawN --device-index 1 --restore-side-buttons
Read commands support --record NEW.json or --replay transcript.json.
`);return;}
 if(command==='list'){print(await inventory());return;}
 if(command==='assignments'){
  if(p[1]==='inputs'){print(await listMouseInputs());return;}
  if(p[1]==='show'){print(await store.assignments());return;}
  if(p[1]!=='run'||!v.input)throw new Error('Use assignments run --input /dev/input/eventN');
  const runtime=new RemapRuntime(v.input,await store.assignments());
  const stop=async()=>{await runtime.stop();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{await runtime.start();print(runtime.snapshot());const timer=setInterval(()=>{const state=runtime.snapshot();if(state.error){console.error(state.error);clearInterval(timer);void runtime.stop();process.exitCode=1;}},200);}catch(e){await runtime.stop();throw e;}
  return;
 }
 const profiles=command==='profiles',action=p[1],name=p[2];
 if(profiles&&['list','show','delete'].includes(action)){
  if(action==='list')print(await store.profiles());
  else if(action==='show')print(await store.profile(name));
  else{await store.deleteProfile(name);print({deleted:name});}return;
 }
 if(!['inspect','status','dpi','rate','battery','onboard','memory','profiles','buttons'].includes(command))throw new Error('Unknown command; use --help');
 const device=profiles?p[3]:p[1],index=Number(v['device-index']),sensor=Number(v.sensor);
 if(!Number.isInteger(index)||index<0||index>255||!Number.isInteger(sensor)||sensor<0||sensor>255)throw new Error('Device and sensor index must be 0–255');
 if(Boolean(device)===Boolean(v.replay))throw new Error('Supply one device path or --replay');
 if(v.replay&&(v.set!==undefined||profiles||command==='buttons'||v.record))throw new Error('Replay permits read operations only');
 const rows=await inventory();
 let raw:HidrawTransport|undefined,replay:Replay|undefined,record:Recording|undefined;
 try{
  if(v.replay)replay=await Replay.load(v.replay);
  else{if(!rows.some(r=>r.path===device))throw new Error('Choose a Logitech interface from list');raw=await new HidrawTransport(device).open();}
  if(v.record)record=new Recording(raw!);
  const mouse=new Mouse(record??replay??raw!,index,v.long===true),settings=new Settings(mouse),dpi=v.extended?new ExtendedDpiSettings(mouse):settings,rate=v.extended?new ExtendedRateSettings(mouse):settings;
  let result:any;
  if(command==='inspect')result=await mouse.inspect();
  if(command==='battery')result=await settings.battery();
  if(command==='onboard'){const o=new OnboardSettings(mouse);result=v.set===undefined?await o.state():await o.setMode(v.set);}
  if(command==='memory'){const memory=new OnboardMemory(mouse);result=v.snapshot?await memory.snapshot():await memory.describe();if(v.snapshot&&!result.complete)process.exitCode=1;}
  if(command==='buttons'){if(!v['restore-side-buttons'])throw new Error('Explicit --restore-side-buttons required');result=await new OnboardBindings(mouse).restoreButtonOutputs(path.join(store.root,'backups'));}
  if(command==='dpi')result=v.set===undefined?await dpi.dpi(sensor):await dpi.setDpi(Number(v.set),sensor);
  if(command==='rate')result=v.set===undefined?await rate.reportRate():await rate.setReportRate(Number(v.set));
  if(profiles){const identity=identifyTarget(device,index,rows);if(action==='capture'){const profile=await captureProfile(settings,identity,sensor);await store.saveProfile(name,profile,v.overwrite===true);result={saved:name,profile};}else if(action==='apply')result=await applyProfile(settings,await store.profile(name),identity);else throw new Error('Unknown profiles action');}
  if(command==='status'){
   result={protocol:await mouse.handshake(),settings:{}};
   for(const [key,read] of Object.entries({dpi:()=>dpi.dpi(sensor),rate:()=>rate.reportRate(),battery:()=>settings.battery(),onboard:()=>new OnboardSettings(mouse).state()})){
    try{result.settings[key]=await read();}catch(e){result.settings[key]={error:String(e)};process.exitCode=1;}
   }
  }
  replay?.assertFinished();if(replay)result._source='offline replay; no hardware accessed';
  if(v.output){await fs.writeFile(v.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});print({saved:v.output,complete:result.complete});}else print(result);
 }finally{try{if(record&&v.record)await record.save(v.record);}finally{await raw?.close();}}
}
try{await run();}catch(e){console.error('Error:',e instanceof Error?e.message:String(e));process.exitCode=1;}
