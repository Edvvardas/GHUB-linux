import {validateConfig} from '../shared/config.ts';
import {KEY_CODES} from '../shared/keys.ts';
// USB keyboard usage -> Linux input codes, corroborated by Linux hid-input.c.
const keyboard=[0,0,0,0,30,48,46,32,18,33,34,35,23,36,37,38,50,49,24,25,16,19,31,20,22,47,17,45,21,44,2,3,4,5,6,7,8,9,10,11,28,1,14,15,57,12,13,26,27,43,43,39,40,41,51,52,53,58,59,60,61,62,63,64,65,66,67,68,87,88,99,70,119,110,102,104,111,107,109,106,105,108,103,69,98,55,74,78,96,79,80,81,75,76,77,71,72,73,82,83,86,127,116,117];
const slots:Record<string,number>={BTN_LEFT:1,BTN_RIGHT:2,BTN_MIDDLE:3,BTN_SIDE:4,BTN_EXTRA:5};
const modifiers=['KEY_LEFTCTRL','KEY_LEFTSHIFT','KEY_LEFTALT','KEY_LEFTMETA','KEY_RIGHTCTRL','KEY_RIGHTSHIFT','KEY_RIGHTALT','KEY_RIGHTMETA'];
export function onboardAssignments(config:unknown){
 const normalized=validateConfig(config),result:Record<string,any>={};
 if(!Object.keys(normalized.bindings).length)throw new Error('No assignments to save');
 for(const[source,action]of Object.entries(normalized.bindings)){
  const slot=slots[source];if(!slot)throw new Error(`${source} has no established onboard slot`);
  if(action.type==='macro')throw new Error('Firmware macro storage is not implemented; use software playback for macros');
  if(action.type==='disabled')result[slot]={kind:'no_action'};
  else if(action.type==='mouse'){if(!slots[action.button])throw new Error('Output button is not supported onboard');result[slot]={kind:'mouse',button:slots[action.button]};}
  else{
   let mask=0;const regular=[];
   for(const key of action.keys){const bit=modifiers.indexOf(key);if(bit>=0)mask|=1<<bit;else regular.push(key);}
   if(regular.length!==1)throw new Error('Onboard shortcuts support one regular key plus modifiers');
   const usage=keyboard.indexOf(KEY_CODES[regular[0]],4);
   if(usage<4)throw new Error(`${regular[0]} has no supported onboard keyboard encoding`);
   result[slot]={kind:'keyboard',usage,modifiers:mask};
  }
 }
 return result;
}
