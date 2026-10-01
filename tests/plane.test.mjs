import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_PLANES, cross, toWorld, toPlane } from '../src/core/geometry/plane.ts';
test('three base planes use the specified right handed frames and round trip double coordinates',()=>{
  const normals={XY:[0,0,1],XZ:[0,-1,0],YZ:[1,0,0]};
  for(const [name,plane] of Object.entries(BASE_PLANES)){
    assert.deepEqual(cross(plane.u,plane.v),normals[name]);
    for(const p of [[0,0],[40,30],[-9999.123456789,0.000001],[9999.0001,-123.456789]]){
      const result=toPlane(plane,toWorld(plane,p));assert(Math.hypot(result[0]-p[0],result[1]-p[1])<=1e-6);
    }
  }
});
test('translated orthonormal plane round trips and rejects off-plane or invalid basis',()=>{
  const s=Math.SQRT1_2,plane={origin:[50,-20,10],u:[s,s,0],v:[0,0,1]},point=[-30.123456789,80];
  const world=toWorld(plane,point),round=toPlane(plane,world);assert(Math.hypot(round[0]-point[0],round[1]-point[1])<=1e-6);
  assert.throws(()=>toPlane(BASE_PLANES.XY,[0,0,0.01]),e=>e.code==='OFF_PLANE');
  assert.throws(()=>toWorld({...plane,v:plane.u},point),e=>e.code==='INVALID_PLANE');
  assert.throws(()=>toWorld(plane,[Infinity,0]),e=>e.code==='INVALID_POINT');
});
