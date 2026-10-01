import assert from 'node:assert/strict';
import test from 'node:test';
import { SketchDrag } from '../src/app/sketch-drag.ts';
import { BASE_PLANES } from '../src/core/geometry/plane.ts';
const sketch={id:'sketch',name:'Sketch',kind:'sketch',visible:true,plane:BASE_PLANES.XY,points:[{id:'p',position:[0,0]}],entities:[],constraints:[]};
const ok=input=>({sketch:input.sketch,status:'under-constrained',dof:2,resultCode:0,failedConstraintIds:[],residuals:{},toleranceMm:1e-5});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function controlled(){const calls=[],previews=[],commits=[];let current=true,cancelled=0;
  const drag=new SketchDrag({sketch,pointId:'p',solve:input=>new Promise((resolve,reject)=>calls.push({input,resolve,reject})),isCurrent:()=>current,preview:s=>previews.push(s),error:()=>{},commit:async s=>commits.push(s),cancelSolve:()=>cancelled++});
  return {drag,calls,previews,commits,setCurrent:v=>current=v,cancelled:()=>cancelled};}
test('one inflight + latest slot coalesces moves, stale result never previews, one final commit',async()=>{
  const h=controlled();h.drag.update([10,0]);h.drag.update([20,0]);h.drag.update([30,0]);assert.equal(h.calls.length,1);
  const finished=h.drag.finish();h.calls[0].resolve(ok(h.calls[0].input));await tick();assert.equal(h.previews.length,0);assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1].input.sketch.points[0].position,[30,0]);
  h.calls[1].resolve(ok(h.calls[1].input));await finished;assert.equal(h.previews.length,1);assert.equal(h.commits.length,1);assert.deepEqual(h.commits[0].points[0].position,[30,0]);
});
test('cancellation resolves finish and refuses late native reply',async()=>{
  const h=controlled();h.drag.update([10,0]);const finished=h.drag.finish();h.drag.cancel();await finished;
  h.calls[0].resolve(ok(h.calls[0].input));await tick();assert.equal(h.cancelled(),1);assert.equal(h.previews.length,0);assert.equal(h.commits.length,0);
});
test('latest failure cannot commit an earlier success',async()=>{
  const h=controlled();h.drag.update([10,0]);h.calls[0].resolve(ok(h.calls[0].input));await tick();assert.equal(h.previews.length,1);
  h.drag.update([20,0]);const finished=h.drag.finish();h.calls[1].resolve({...ok(h.calls[1].input),sketch:null,status:'inconsistent'});await assert.rejects(finished,/求解失败/);assert.equal(h.commits.length,0);
});
test('revision/session invalidation and unchanged point never produce history',async()=>{
  const h=controlled();h.drag.update([10,0]);h.setCurrent(false);h.calls[0].resolve(ok(h.calls[0].input));await tick();await assert.rejects(h.drag.finish(),/已改变/);assert.equal(h.commits.length,0);
  const same=controlled();same.drag.update([1e-10,0]);same.calls[0].resolve(ok(same.calls[0].input));await same.drag.finish();assert.equal(same.commits.length,0);
});
