import {test} from 'node:test';import assert from 'node:assert/strict';
import {Service} from '../src/service.ts';

test('editing a running binding replaces the active snapshot after persistence',async()=>{
 const calls:any[]=[];const store:any={saveAssignments:async(c:any)=>{calls.push(['saved',c]);return c;}};
 const s=new Service(store);s.runtime={snapshot:()=>({state:'running',path:'/test/input'}),stop:async()=>calls.push(['stopped'])};
 s.state=async()=>({}) as any;s.startRuntime=async(b:any)=>{calls.push(['started',b]);return {} as any;};
 const config={schema_version:1,bindings:{BTN_SIDE:{type:'key',keys:['KEY_RIGHT']}}};
 await s.saveAssignments(config);
 assert.deepEqual(calls.map(c=>c[0]),['stopped','saved','started']);
 assert.deepEqual(calls[2][1],{path:'/test/input',config});assert.deepEqual(s.assignments,config);
});
test('invalid new bindings cannot stop or mutate the active runtime',async()=>{
 let stopped=false,written=false;const s=new Service({saveAssignments:async()=>{written=true}} as any);s.runtime={snapshot:()=>({state:'running',path:'/test'}),stop:async()=>{stopped=true}};
 await assert.rejects(s.saveAssignments({schema_version:1,bindings:{BTN_SIDE:{type:'key',keys:['unknown']}}}));assert.equal(stopped,false);assert.equal(written,false);
});
test('failed persistence leaves old assignments and does not restart',async()=>{
 const s=new Service({saveAssignments:async()=>{throw new Error('disk failure')}} as any);s.runtime={snapshot:()=>({state:'running',path:'/test'}),stop:async()=>{}};
 let restarted=false;s.startRuntime=async()=>{restarted=true;return {} as any};const before=s.assignments;
 await assert.rejects(s.saveAssignments({schema_version:1,bindings:{}}),/disk failure/);assert.equal(s.assignments,before);assert.equal(restarted,false);
});
