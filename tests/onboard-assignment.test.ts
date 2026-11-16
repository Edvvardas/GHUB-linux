import {test} from 'node:test';import assert from 'node:assert/strict';
import {onboardAssignments} from '../src/backend/onboard-assignment.ts';
import {encodeBinding} from '../src/backend/onboard.ts';
test('arrow bindings encode USB keyboard usages, not Linux evdev codes',()=>{
 const bindings=onboardAssignments({schema_version:1,bindings:{BTN_SIDE:{type:'key',keys:['KEY_LEFT']},BTN_EXTRA:{type:'key',keys:['KEY_RIGHT']}}});
 assert.equal(encodeBinding(bindings[4]).toString('hex'),'80020050');assert.equal(encodeBinding(bindings[5]).toString('hex'),'8002004f');
});
test('right modifiers preserve HID modifier mask',()=>{const b=onboardAssignments({schema_version:1,bindings:{BTN_SIDE:{type:'key',keys:['KEY_RIGHTCTRL','KEY_C']}}});assert.equal(encodeBinding(b[4]).toString('hex'),'80021006');});
test('unsupported macros and multiple regular keys reject the whole operation',()=>{for(const a of [{type:'key',keys:['KEY_A','KEY_B']},{type:'macro',mode:'once',events:[{type:'key_down',key:'KEY_A'},{type:'key_up',key:'KEY_A'}]}])assert.throws(()=>onboardAssignments({schema_version:1,bindings:{BTN_SIDE:a}}));});
