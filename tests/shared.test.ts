import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {browserCodeToLinux,ChordCapture,KEY_CODES} from '../src/shared/keys.ts';
import {validateConfig} from '../src/shared/config.ts';import {Store} from '../src/store.ts';

test('physical browser codes distinguish arrows, sides, punctuation and keypad',()=>{
 for(const [code,key] of Object.entries({ArrowLeft:'KEY_LEFT',ArrowRight:'KEY_RIGHT',ControlRight:'KEY_RIGHTCTRL',ShiftRight:'KEY_RIGHTSHIFT',Numpad1:'KEY_KP1',Digit1:'KEY_1',NumpadEnter:'KEY_KPENTER',Enter:'KEY_ENTER',Slash:'KEY_SLASH',IntlBackslash:'KEY_102ND'}))assert.equal(browserCodeToLinux(code),key);
 assert.equal(browserCodeToLinux('Unidentified'),null);
 assert.equal(KEY_CODES.KEY_LEFT,105);assert.equal(KEY_CODES.KEY_RIGHT,106);
});
test('capture releases by physical identity and ignores repeat',()=>{
 const c=new ChordCapture();c.press('ShiftRight');c.press('Digit8');c.press('Digit8',true);c.release('ShiftRight');assert.equal(c.ready,false);c.release('Digit8');assert.equal(c.ready,true);assert.deepEqual(c.keys,['KEY_RIGHTSHIFT','KEY_8']);
 c.press('ArrowLeft');c.release('ArrowLeft');assert.deepEqual(c.keys,['KEY_LEFT']);
});
test('capture invalid or canceled chords cannot commit',()=>{const c=new ChordCapture();c.press('Unidentified');c.release('Unidentified');assert.equal(c.ready,false);c.press('KeyA');c.cancel();assert.equal(c.ready,false);assert.deepEqual(c.keys,[]);});
test('invalid configs and executable commands are rejected',()=>{
 for(const value of [{schema_version:2,bindings:{}},{schema_version:1,bindings:{BTN_SIDE:{type:'shell',command:'anything'}}},{schema_version:1,bindings:{BTN_SIDE:{type:'key',keys:['KEY_NOT_REAL']}}},{schema_version:1,bindings:{BTN_SIDE:{type:'key',keys:['KEY_A','KEY_A']}}}])assert.throws(()=>validateConfig(value));
});
test('macro balancing and repeat rate bounds',()=>{
 const events=[{type:'key_down',key:'KEY_A'},{type:'key_up',key:'KEY_A'}];const doc=(events:any[],mode='once')=>({schema_version:1,bindings:{BTN_EXTRA:{type:'macro',mode,events}}});
 assert.throws(()=>validateConfig(doc(events.slice(0,1))));assert.throws(()=>validateConfig(doc(events,'toggle')));assert.doesNotThrow(()=>validateConfig(doc([...events,{type:'delay',ms:10}],'toggle')));
});
test('private atomic storage, no-clobber profiles and symlinks',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'ghub-store-'));try{
 const s=new Store(path.join(tmp,'data'));assert.deepEqual(await s.assignments(),{schema_version:1,bindings:{}});
 const config=validateConfig({schema_version:1,bindings:{BTN_SIDE:{type:'key',keys:['KEY_LEFT']}}});await s.saveAssignments(config);assert.deepEqual(await s.assignments(),config);
 assert.equal((await fs.stat(path.join(s.root,'assignments.json'))).mode&0o777,0o600);
 await s.saveProfile('Test',{dpi:800});await assert.rejects(s.saveProfile('Test',{dpi:1600}));assert.deepEqual(await s.profile('Test'),{dpi:800});await s.saveProfile('Test',{dpi:1600},true);assert.deepEqual(await s.profiles(),['Test']);
 assert.throws(()=>s.name('../escape'));await fs.symlink(path.join(s.root,'assignments.json'),path.join(s.root,'profiles','Link.json'));await assert.rejects(s.profile('Link'));
 await fs.symlink(s.root,path.join(tmp,'alias'));await assert.rejects(new Store(path.join(tmp,'alias')).saveAssignments(config));
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
