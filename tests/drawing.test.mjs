import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arcThrough, drawingFeature, nearestSnap } from '../src/core/geometry/drawing.ts';
import { BASE_PLANES } from '../src/core/geometry/plane.ts';
const empty=()=>({id:'sketch',kind:'sketch',name:'S',visible:true,plane:BASE_PLANES.XY,points:[],entities:[],constraints:[]});
let sequence=0;const id=()=>`test-${++sequence}`;
test('screen snapping has a CSS-pixel boundary and returns an explicit target independent of world scale',()=>{
  const candidate={position:[9999.123456,0],screen:[100,100],snap:{kind:'point',pointId:'existing'}};
  assert.equal(nearestSnap([108,100],[candidate]).snap.pointId,'existing');assert.equal(nearestSnap([108.01,100],[candidate]),null);
  candidate.position=[0.001,0];assert.equal(nearestSnap([108,100],[candidate]).position[0],0.001);
});
test('captured line endpoint gets a distinct ID and a real coincident relation; rectangle corners are explicitly closed',()=>{
  const sketch=empty();sketch.points=[{id:'existing',position:[10,20]}];
  const before=JSON.stringify(sketch),line=drawingFeature(sketch,'line',[{position:[0,0],snap:{kind:'origin'}},{position:[10.1,20],snap:{kind:'point',pointId:'existing'}}],id).feature;
  assert.equal(JSON.stringify(sketch),before);assert(line.constraints.some(c=>c.kind==='coincident'&&c.refs.some(r=>r.pointId==='existing')));
  assert.notEqual(line.entities[0].endPointId,'existing');assert.deepEqual(line.points.at(-1).position,[10,20]);
  const rect=drawingFeature(empty(),'rectangle',[{position:[0,0]},{position:[40,30]}],id).feature;
  assert.equal(rect.entities.length,4);assert.equal(rect.points.length,8);assert.equal(rect.constraints.filter(c=>c.kind==='coincident').length,4);
  assert.equal(rect.constraints.filter(c=>c.kind==='horizontal').length,2);assert.equal(rect.constraints.filter(c=>c.kind==='vertical').length,2);
});
test('three-point arc uses a stable translated circumcenter and the correct direction; invalid shapes leave input unchanged',()=>{
  const ccw=arcThrough([10,0],[0,10],[-10,0]);assert.deepEqual(ccw.center,[0,0]);assert.equal(ccw.clockwise,false);
  const cw=arcThrough([10,0],[0,-10],[-10,0]);assert.equal(cw.clockwise,true);
  const translated=arcThrough([9999,9989],[9989,9999],[9979,9989]);assert.deepEqual(translated.center,[9989,9989]);
  const sketch=empty(),before=JSON.stringify(sketch);
  for(const [tool,positions] of [['line',[[0,0],[0,0]]],['rectangle',[[0,0],[40,0]]],['circle',[[0,0],[0,0]]],['arc',[[0,0],[1,1],[2,2]]],['arc',[[0,0],[0,0],[1,1]]]]){
    assert.throws(()=>drawingFeature(sketch,tool,positions.map(position=>({position})),id));assert.equal(JSON.stringify(sketch),before);
  }
});
