import {BUTTON_CODES,KEY_CODES} from './keys.ts';
export type MacroEvent = {type:'key_down'|'key_up';key:string}|{type:'delay';ms:number};
export type Action = {type:'disabled'}|{type:'mouse';button:string}|{type:'key';keys:string[]}|{type:'macro';mode:'once'|'while_held'|'toggle';events:MacroEvent[]};
export type RemapConfig = {schema_version:1;bindings:Record<string,Action>};
export function integer(value:unknown,low:number,high:number,label:string):number{
 if(!Number.isInteger(value)||typeof value!=='number'||value<low||value>high)throw new Error(`${label} must be an integer from ${low} to ${high}`);
 return value;
}
function object(value:unknown,allowed:string[],label:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new Error(`${label}: invalid or unknown fields`);
 return value as Record<string,unknown>;
}
export function validateAction(value:unknown):Action{
 const a=object(value,['type','button','keys','mode','events'],'Action');
 if(a.type==='disabled'){object(a,['type'],'Disabled');return {type:'disabled'};}
 if(a.type==='mouse'){
  object(a,['type','button'],'Mouse');if(typeof a.button!=='string'||!Object.hasOwn(BUTTON_CODES,a.button))throw new Error('Unknown mouse button');
  return {type:'mouse',button:a.button};
 }
 if(a.type==='key'){
  object(a,['type','keys'],'Chord');
  if(!Array.isArray(a.keys)||a.keys.length<1||a.keys.length>8||a.keys.some(k=>typeof k!=='string'||!Object.hasOwn(KEY_CODES,k))||new Set(a.keys).size!==a.keys.length)throw new Error('Choose one to eight distinct supported keys');
  return {type:'key',keys:[...a.keys] as string[]};
 }
 if(a.type!=='macro')throw new Error('Unknown action type');
 object(a,['type','mode','events'],'Macro');
 if(!['once','while_held','toggle'].includes(a.mode as string)||!Array.isArray(a.events)||!a.events.length||a.events.length>512)throw new Error('Macro needs a valid mode and 1–512 events');
 const held=new Set<string>();let delay=0,presses=0;
 const events:MacroEvent[]=a.events.map(raw=>{
  const e=object(raw,['type','key','ms'],'Event');
  if(e.type==='delay'){object(e,['type','ms'],'Delay');const ms=integer(e.ms,0,60000,'Delay');delay+=ms;return {type:'delay',ms};}
  object(e,['type','key'],'Key event');
  if(!['key_down','key_up'].includes(e.type as string)||typeof e.key!=='string'||(!Object.hasOwn(KEY_CODES,e.key)&&!Object.hasOwn(BUTTON_CODES,e.key)))throw new Error('Unsupported macro key event');
  if(e.type==='key_down'){if(held.has(e.key))throw new Error('Key already pressed');held.add(e.key);presses++;}
  else {if(!held.delete(e.key))throw new Error('Key was not pressed');}
  return {type:e.type as 'key_down'|'key_up',key:e.key};
 });
 if(held.size||!presses)throw new Error('Every macro press needs a release');
 if(delay>120000)throw new Error('Macro delay exceeds two minutes');
 if(a.mode!=='once'&&delay<10)throw new Error('Repeating macros need at least 10 ms of delay');
 return {type:'macro',mode:a.mode as 'once'|'while_held'|'toggle',events};
}
export function validateConfig(value:unknown):RemapConfig{
 const c=object(value,['schema_version','bindings'],'Assignments');
 if(c.schema_version!==1)throw new Error('Unsupported assignments version');
 if(!c.bindings||typeof c.bindings!=='object'||Array.isArray(c.bindings))throw new Error('Bindings must be an object');
 const bindings=Object.fromEntries(Object.entries(c.bindings).map(([key,action])=>{
  if(!Object.hasOwn(BUTTON_CODES,key))throw new Error('Unknown input mouse button');
  return [key,validateAction(action)];
 }));
 return {schema_version:1,bindings};
}
