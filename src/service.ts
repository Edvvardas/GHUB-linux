import {inventory,listMouseInputs} from './backend/inventory.ts';
import {HidrawTransport,Mouse,UnsupportedFeature} from './backend/protocol.ts';
import {Settings} from './backend/settings.ts';
import {validateConfig,integer} from './shared/config.ts';
import {Store} from './store.ts';

export class Service {
 store:Store; selected:{path:string;index:number;sensor:number;long:boolean}|null=null;
 settings:any=null; errors:string[]=[];runtime:any=null;assignments:any={schema_version:1,bindings:{}};tail:Promise<any>=Promise.resolve();
 constructor(store=new Store()){this.store=store;}
 async init(){this.assignments=await this.store.assignments();const devices=await inventory();
  const suggestions=[];for(const p of devices){if(!p.name?.toLowerCase().includes('receiver')||!p.physical_path)continue;for(const c of devices){const prefix=p.physical_path+':';if(c.physical_path?.startsWith(prefix)){const slot=c.physical_path.slice(prefix.length);if(/^\d+$/.test(slot)&&+slot>0&&+slot<255)suggestions.push({path:p.path,index:+slot,sensor:0,long:false});}}}
  if(suggestions.length===1)this.selected=suggestions[0];
 }
 queue<T>(work:()=>Promise<T>):Promise<T>{const result=this.tail.then(work);this.tail=result.catch(()=>{});return result;}
 async state(){return {devices:await inventory(),inputs:await listMouseInputs(),selected:this.selected,selectedDevice:this.selected,settings:this.settings,assignments:this.assignments,runtime:this.runtime?.snapshot()??{state:'stopped',error:null},profiles:await this.store.profiles(),errors:this.errors};}
 async withMouse<T>(work:(mouse:Mouse,settings:Settings)=>Promise<T>){
  if(!this.selected)throw new Error('Select a mouse settings interface first');
  const rows=await inventory();if(!rows.some(d=>d.path===this.selected!.path))throw new Error('Selected Logitech interface is no longer present');
  const transport=await new HidrawTransport(this.selected.path).open();
  try{const mouse=new Mouse(transport,this.selected.index,this.selected.long);return await work(mouse,new Settings(mouse));}finally{await transport.close();}
 }
 async refresh(){this.errors=[];this.settings={};await this.withMouse(async(mouse,s)=>{
  const {OnboardSettings}=await import('./backend/onboard.ts');
  for(const [name,read] of Object.entries({dpi:()=>s.dpi(this.selected!.sensor),rate:()=>s.reportRate(),battery:()=>s.battery(),onboard:()=>new OnboardSettings(mouse).state()})){
   try{this.settings[name]=await read();}catch(e){this.errors.push(`${name}: ${String(e)}`);}
  }
 });return this.state();}
 async select(body:any){if(typeof body.path!=='string')throw new Error('Choose a device');integer(body.index,0,255,'Device index');integer(body.sensor??0,0,255,'Sensor');if(!(await inventory()).some(d=>d.path===body.path))throw new Error('Select an enumerated Logitech interface');this.selected={path:body.path,index:body.index,sensor:body.sensor??0,long:body.long===true};this.settings=null;this.errors=[];return this.state();}
 async changeSettings(body:any){
  if(body.mode!==undefined){if(!['host','onboard'].includes(body.mode))throw new Error('Unknown mode');await this.withMouse(async m=>{const {OnboardSettings}=await import('./backend/onboard.ts');await new OnboardSettings(m).setMode(body.mode);});}
  if(body.dpi!==undefined||body.rate_hz!==undefined){
   await this.withMouse(async(m,s)=>{
    const {captureProfile,applyProfile,identifyTarget}=await import('./backend/profiles.ts');
    const identity=identifyTarget(this.selected!.path,this.selected!.index,await inventory());
    const profile:any={schema_version:1,device:identity,sensor:this.selected!.sensor,mode:'host'};
    if(body.dpi!==undefined)profile.dpi=integer(body.dpi,1,65535,'DPI');
    if(body.rate_hz!==undefined)profile.rate_hz=integer(body.rate_hz,1,8000,'Report rate');
    await applyProfile(s,profile,identity);
   });
  }
  return this.refresh();
 }
 async saveAssignments(config:unknown){
  const normalized=validateConfig(config),running=this.runtime?.snapshot().state==='running',input=this.runtime?.snapshot().path;
  if(running)await this.runtime.stop();
  this.assignments=await this.store.saveAssignments(normalized);
  if(running&&input)await this.startRuntime({path:input,config:normalized});
  return this.state();
 }
 async startRuntime(body:any){if(typeof body.path!=='string')throw new Error('Choose a Linux mouse input');const config=validateConfig(body.config??this.assignments);
  if(this.runtime){await this.runtime.stop();}
  const {RemapRuntime}=await import('./backend/remap-runtime.ts');this.runtime=new RemapRuntime(body.path,config);await this.runtime.start();return this.state();
 }
 async stopRuntime(){if(this.runtime)await this.runtime.stop();return this.state();}
 async saveProfile(body:any){this.store.name(body.name);if(body.overwrite!==undefined&&typeof body.overwrite!=='boolean')throw new Error('Invalid overwrite option');
  const {captureProfile,identifyTarget}=await import('./backend/profiles.ts');
  const identity=identifyTarget(this.selected?.path??'',this.selected?.index??255,await inventory());
  const profile=await this.withMouse(async(_m,s)=>captureProfile(s,identity,this.selected!.sensor));
  await this.store.saveProfile(body.name,profile,body.overwrite===true);return this.state();
 }
 async applyProfile(name:string){const profile=await this.store.profile(name);const {applyProfile,identifyTarget}=await import('./backend/profiles.ts');const identity=identifyTarget(this.selected?.path??'',this.selected?.index??255,await inventory());await this.withMouse(async(_m,s)=>applyProfile(s,profile,identity));return this.refresh();}
 async memory(){return this.withMouse(async m=>{const {OnboardMemory}=await import('./backend/onboard.ts');return new OnboardMemory(m).snapshot();});}
 async saveOnboard(config:unknown){
  const {onboardAssignments}=await import('./backend/onboard-assignment.ts');
  const bindings=onboardAssignments(config);
  const result=await this.withMouse(async m=>{
   const {OnboardMemory,OnboardSettings,OnboardBindings}=await import('./backend/onboard.ts');
   const d=await new OnboardMemory(m).describe();
   if(d.memory_model_id!==1||d.profile_format_id!==4||d.sector_size!==255)throw new Error('Unsupported onboard memory layout; no settings changed');
   if(this.runtime)await this.runtime.stop();
   const mode=new OnboardSettings(m);
   await mode.setMode('onboard');
   return new OnboardBindings(m).setBindings(bindings,this.store.root+'/backups');
  });
  this.settings=null;
  return {...await this.state(),onboardSave:result};
 }
 async close(){await this.stopRuntime();await this.tail;}
}
