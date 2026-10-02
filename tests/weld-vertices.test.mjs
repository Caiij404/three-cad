import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weldVertices } from '../src/core/geometry/weld-vertices.ts';
function reference(points,tolerance) {
  const vertices=[],ids=points.map(p=>{let id=vertices.findIndex(q=>Math.hypot(...p.map((n,i)=>n-q[i]))<=tolerance);if(id<0){id=vertices.length;vertices.push(p);}return id;});
  return{vertices,ids};
}
test('neighbors across positive/negative cell edges use spherical distance and inclusive tolerance',()=>{
  const points=[[-2.01,0,0],[-1.99,0,0],[1.99,1.99,1.99],[2.01,2.01,2.01],[3,0,0],[4,0,0],[4.00001,0,0],[0,0,0],[.8,.8,0]];
  assert.deepEqual(weldVertices(points,1),reference(points,1));
  assert.notEqual(weldVertices([[0,0,0],[.8,.8,0]],1).ids[0],weldVertices([[0,0,0],[.8,.8,0]],1).ids[1]);
});
test('choose lowest original ID among matching cells; do not union a distance chain',()=>{
  assert.deepEqual(weldVertices([[1.2,0,0],[0,0,0],[.6,0,0]],.7).ids,[0,1,0]);
  assert.deepEqual(weldVertices([[0,0,0],[.6,0,0],[1.2,0,0]],.7).ids,[0,0,1]);
});
test('5000 deterministic duplicate/boundary/dense points agree with independent Euclidean scan',()=>{
  let seed=302;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const points=[];for(let i=0;i<5000;i++){const center=[Math.floor(random()*16)-8,Math.floor(random()*16)-8,Math.floor(random()*16)-8];points.push(i%5===0&&points.length?points.at(-1):center.map(n=>n+.4*(random()-.5)));}
  assert.deepEqual(weldVertices(points,.1),reference(points,.1));
});
test('zero, negative, NaN, infinite tolerance and unsafe grid scales retain scan semantics',()=>{
  for(const tolerance of [0,-1,NaN,Infinity,1e-300])assert.deepEqual(weldVertices([[0,0,0],[0,0,0],[1,0,0],[-1e20,0,0]],tolerance),reference([[0,0,0],[0,0,0],[1,0,0],[-1e20,0,0]],tolerance));
});
