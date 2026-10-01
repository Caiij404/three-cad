import assert from 'node:assert/strict';
import test from 'node:test';
import { drawingFeature } from '../src/core/geometry/drawing.ts';
import { deleteSketchEntities, moveSketchPoint, requireDrawableSketch } from '../src/core/geometry/sketch-edit.ts';
import { BASE_PLANES } from '../src/core/geometry/plane.ts';
const empty={id:'sketch',name:'Sketch',kind:'sketch',visible:true,plane:BASE_PLANES.XY,points:[],entities:[],constraints:[]};
test('entity deletion cleans owned orphan points and referencing constraints, preserving other IDs',()=>{
  const rect=drawingFeature(empty,'rectangle',[{position:[0,0],snap:{kind:'origin'}},{position:[40,30]}]).feature;
  const before=JSON.stringify(rect),entity=rect.entities[0],removed=deleteSketchEntities(rect,[entity.id]);
  assert.equal(removed.entities.length,3);assert.equal(removed.points.length,6);assert.equal(removed.constraints.length,5);
  assert(!removed.constraints.some(c=>c.refs.some(r=>'pointId' in r?[entity.startPointId,entity.endPointId].includes(r.pointId):r.entityId===entity.id)));
  assert.deepEqual(removed.entities,rect.entities.slice(1));assert.equal(JSON.stringify(rect),before);
  const all=deleteSketchEntities(rect,rect.entities.map(e=>e.id));assert.equal(all.points.length,0);assert.equal(all.constraints.length,0);
  assert.throws(()=>deleteSketchEntities(rect,['other']),/只能删除/);
});
test('shared point and its fixed relation survive removing only one owning entity',()=>{
  const sketch={...empty,points:[{id:'a',position:[0,0]},{id:'b',position:[10,0]},{id:'c',position:[10,10]}],entities:[{id:'one',kind:'line',startPointId:'a',endPointId:'b'},{id:'two',kind:'line',startPointId:'b',endPointId:'c'}],constraints:[{id:'fixed',kind:'fixed',refs:[{pointId:'b'}],fixedPosition:[10,0]},{id:'width',kind:'length',refs:[{entityId:'one'}],value:10}]};
  const result=deleteSketchEntities(sketch,['one']);assert.deepEqual(result.points.map(p=>p.id),['b','c']);assert.deepEqual(result.constraints.map(c=>c.id),['fixed']);
});
test('point movement clones input; range, missing point and solved degeneracy reject',()=>{
  const sketch=drawingFeature(empty,'line',[{position:[0,0]},{position:[10,0]}]).feature,id=sketch.entities[0].endPointId;
  assert.deepEqual(moveSketchPoint(sketch,id,[20,5]).points[1].position,[20,5]);assert.deepEqual(sketch.points[1].position,[10,0]);
  assert.throws(()=>moveSketchPoint(sketch,id,[NaN,0]),/有限/);assert.throws(()=>moveSketchPoint(sketch,'missing',[0,0]),/不属于/);
  assert.throws(()=>requireDrawableSketch(moveSketchPoint(sketch,id,[0,0])),/零长度/);
});
