import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Worker as NativeWorker, MessageChannel } from 'node:worker_threads';
import { once } from 'node:events';
import { SolidClient } from '../src/adapters/solid/solid-client.ts';
import { encodeSolidMesh, decodeSolidMesh, encodeSolidInput, decodeSolidInput, solidInputTransfer } from '../src/adapters/solid/solid-wire.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
const volume=(mesh,expected)=>assert(Math.abs(meshMetrics(mesh).signedVolume-expected)<=1e-6);

test('real MessageChannel detaches only fresh Float64 buffers and preserves every coordinate bit',async()=>{
  const positions=[.12345678901234567,-0,1e-100,-1e100,Number.MAX_VALUE,Number.MIN_VALUE,42.125,-23.45678901234567,0],mesh={positions};
  Object.freeze(positions);Object.freeze(mesh);const encoded=encodeSolidMesh(mesh),channel=new MessageChannel();
  assert.equal(encoded.positions.byteLength,9*8);assert.notEqual(new Float32Array([positions[0]])[0],positions[0]);
  const message=once(channel.port2,'message');channel.port1.postMessage(encoded,[encoded.positions.buffer]);assert.equal(encoded.positions.byteLength,0);
  const [received]=await message;assert.deepEqual(decodeSolidMesh(received),mesh);positions.forEach((n,i)=>assert(Object.is(n,received.positions[i])));
  assert.equal(mesh.positions.length,9);channel.port1.close();channel.port2.close();
});
test('Boolean operand buffers are distinct copies even for identical operands; detached and corrupt packets are rejected',()=>{
  const b={size:[20,20,20],center:[0,0,10]},mesh=runSolid({kind:'boolean',operation:'union',a:b,b});
  const input={kind:'mesh-boolean',operation:'intersect',a:mesh,b:mesh},encoded=encodeSolidInput(input),buffers=solidInputTransfer(encoded);
  assert.equal(buffers.length,2);assert.notEqual(buffers[0],buffers[1]);assert.deepEqual(decodeSolidInput(encoded),input);
  const received=structuredClone(encoded,{transfer:buffers});assert(buffers.every(b=>b.byteLength===0));assert.deepEqual(decodeSolidInput(received),input);volume(mesh,8000);
  const code=e=>e.code==='INVALID_SOLID_WIRE';assert.throws(()=>decodeSolidInput(encoded),code);
  for(const packet of [null,{positions:new Float32Array(9),triangles:1},{positions:new Float64Array(9),triangles:2},{positions:new Float64Array([NaN,0,0,0,0,0,0,0,0]),triangles:1},{positions:new Float64Array(9),triangles:-1}])assert.throws(()=>decodeSolidMesh(packet),code);
  assert.throws(()=>encodeSolidMesh({positions:[1]}),code);assert.throws(()=>encodeSolidMesh({positions:Array(9).fill(Infinity)}),code);
  assert.deepEqual(decodeSolidMesh(encodeSolidMesh({positions:[]})),{positions:[]});
});
test('actual production SolidClient and Worker transfer both ways, retain original operands and recover after a real kernel refusal',async()=>{
  const original=globalThis.Worker,ports=[];
  class Port {
    onmessage=null;onerror=null;onmessageerror=null;diagnostics=[];sent=[];received=[];
    constructor(){this.worker=new NativeWorker(new URL('./fixtures/solid-native-worker.mjs',import.meta.url));ports.push(this);
      this.worker.on('message',data=>{if(data.__transferDiagnostic)this.diagnostics.push(data);else{if(data.ok)this.received.push({float64:data.output.positions instanceof Float64Array,bytes:data.output.positions.byteLength,triangles:data.output.triangles});this.onmessage?.({data});}});
      this.worker.on('error',error=>this.onerror?.({message:error.message}));}
    postMessage(value,transfer=[]){const before=transfer.map(b=>b.byteLength);this.worker.postMessage(value,transfer);this.sent.push({kind:value.input.kind,beforeBytes:before,afterBytes:transfer.map(b=>b.byteLength)});}
    terminate(){this.termination=this.worker.terminate();}
  }
  globalThis.Worker=Port;const client=new SolidClient();
  try{
    const aBox={size:[20,20,20],center:[10,10,10]},bBox={size:[20,20,20],center:[20,10,10]};
    const a=runSolid({kind:'boolean',operation:'union',a:aBox,b:aBox}),b=runSolid({kind:'boolean',operation:'union',a:bBox,b:bBox}),before=structuredClone({a,b});
    const actual=await client.run({kind:'mesh-boolean',operation:'union',a,b},8),expected=runSolid({kind:'mesh-boolean',operation:'union',a,b});
    assert.deepEqual(actual,expected);assert.deepEqual({a,b},before);volume(actual,12000);
    await assert.rejects(client.run({kind:'mesh-boolean',operation:'subtract',a:{positions:[]},b},9),e=>e.code==='BOOLEAN_EMPTY_OPERAND');
    const recovery=await client.run({kind:'mesh-boolean',operation:'intersect',a,b},10);volume(recovery,4000);
    const empty=await client.run({kind:'mesh-boolean',operation:'intersect',a,b:runSolid({kind:'boolean',operation:'union',a:{size:[20,20,20],center:[100,0,0]},b:{size:[20,20,20],center:[100,0,0]}})},11);assert.deepEqual(empty,{positions:[]});
    await new Promise(resolve=>setTimeout(resolve,20));const port=ports[0];assert(port.received.every(r=>r.float64&&r.bytes===r.triangles*9*8));
    assert.equal(port.diagnostics.length,3);assert(port.diagnostics.every(d=>d.afterBytes===0));
    assert(port.sent.every(s=>s.afterBytes.length===2&&s.afterBytes.every(n=>n===0)));assert(port.sent[0].beforeBytes.every(n=>n>0));
    assert.deepEqual({a,b},before);
  }finally{client.dispose();await Promise.all(ports.map(p=>p.termination));if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
});
