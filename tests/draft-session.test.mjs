import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireDraftWriter} from '../generated/dist/src/draftSession.js';
test('writer excludes competitors, drains operations and rejects after release',async t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let held=false;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,_options,fn)=>{if(held)return fn(null);held=true;try{return await fn({});}finally{held=false;}}}}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;});
 const a=await acquireDraftWriter();assert.equal(a.status,'owned');assert.equal((await acquireDraftWriter()).status,'busy');
 let done;const work=a.writer.run(()=>new Promise(r=>{done=r;}));await Promise.resolve();const release=a.writer.release();assert.equal((await acquireDraftWriter()).status,'busy');done();await work;await release;await assert.rejects(a.writer.run(async()=>true));
 const b=await acquireDraftWriter();assert.equal(b.status,'owned');await b.writer.release();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});assert.equal((await acquireDraftWriter()).status,'unavailable');
});
