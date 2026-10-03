import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { empty, sketch, extrusion } from './fixtures/domain-document.mjs';
function doc(){const d=empty();d.features=[sketch(),extrusion()];return d;}
function box(depth=20){const b={center:[10,10,depth/2],size:[20,20,depth]};return runSolid({kind:'boolean',operation:'union',a:b,b});}
const state=e=>({document:e.document,cache:e.cache,revision:e.revision,history:e.historyLength,canRedo:e.canRedo,dirty:e.dirty});
const volume=(mesh,expected)=>assert(Math.abs(meshMetrics(mesh).signedVolume-expected)<=1e-6);

test('owned meshes are deeply frozen; input, exported copies and view changes cannot corrupt history',async()=>{
  const input=box(),engine=new ProjectEngine(doc(),{cache:{'extrude-1':input}}),owned=engine.readonlyCache['extrude-1'];
  assert.notEqual(owned,input);assert(Object.isFrozen(engine.readonlyCache)&&Object.isFrozen(owned)&&Object.isFrozen(owned.positions));
  input.positions[0]=999;const copy=engine.cache;copy['extrude-1'].positions[1]=888;delete copy['extrude-1'];
  assert.throws(()=>{owned.positions[0]=123;},TypeError);assert.throws(()=>{engine.readonlyCache['extrude-1']=box(30);},TypeError);
  volume(engine.cache['extrude-1'],8000);
  await engine.execute({kind:'rename-project',name:'named'});assert.equal(engine.readonlyCache['extrude-1'],owned);
  const view=engine.document.view;view.target=[2,3,4];engine.setView(view);
  engine.undo();assert.equal(engine.readonlyCache['extrude-1'],owned);assert.deepEqual(engine.document.view,view);
  engine.redo();assert.equal(engine.readonlyCache['extrude-1'],owned);assert.deepEqual(engine.document.view,view);
});
test('unchanged recompute meshes share frozen identity; fresh output is owned and exact undo/redo survives later caller mutation',async()=>{
  let output,reuse=true,baseline;
  const engine=new ProjectEngine(doc(),{cache:{'extrude-1':box()},recompute:async(document,context)=>{
    baseline=context.baseline;
    assert.throws(()=>{baseline.cache['extrude-1'].positions[0]=500;},TypeError);
    output=reuse?baseline.cache['extrude-1']:box(document.features[1].depth);
    return{document,cache:{'extrude-1':output}};
  }}),first=engine.readonlyCache['extrude-1'];
  const renamed=engine.document.features[0];renamed.name='same geometry';await engine.execute({kind:'replace-feature',feature:renamed});
  assert.equal(engine.readonlyCache['extrude-1'],first);assert(Object.isFrozen(baseline)&&Object.isFrozen(baseline.document.features));
  reuse=false;const changed=engine.document.features[1];changed.depth=30;await engine.execute({kind:'replace-feature',feature:changed});
  const next=engine.readonlyCache['extrude-1'];assert.notEqual(next,output);output.positions.fill(777);
  volume(next,12000);engine.undo();assert.equal(engine.readonlyCache['extrude-1'],first);
  engine.redo();assert.equal(engine.readonlyCache['extrude-1'],next);volume(engine.cache['extrude-1'],12000);
});
test('new malformed, non-solid and caller-frozen meshes are validated without trusting their shape or ID',async()=>{
  let returned;
  const engine=new ProjectEngine(doc(),{cache:{'extrude-1':box()},recompute:async document=>({document,cache:{'extrude-1':returned}})});
  await engine.execute({kind:'rename-project',name:'redo'});engine.undo();const before=state(engine);
  for(const mesh of [null,{positions:[NaN,0,0]},{positions:[0,0,0,1,0,0,0,1,0]},Object.freeze({positions:Object.freeze([0,0,0,1,0,0,0,1,0])})]){
    returned=mesh;const changed=engine.document.features[1];changed.depth=30;
    await assert.rejects(engine.execute({kind:'replace-feature',feature:changed}),e=>e.code==='INVALID_CACHE');assert.deepEqual(state(engine),before);
  }
  engine.redo();assert.equal(engine.document.name,'redo');
});
test('cancel/new project during yielded cache validation rejects the old atomic replacement',async()=>{
  const engine=new ProjectEngine(doc(),{cache:{'extrude-1':box()},recompute:async document=>({document,cache:{'extrude-1':box(document.features[1].depth)}})});
  const before=state(engine),candidate=engine.document;candidate.features[1].depth=30;
  const pending=engine.openDocument(candidate);assert(engine.busy);
  setTimeout(()=>engine.cancelPending(),0);await assert.rejects(pending,e=>e.code==='STALE_TRANSACTION');assert.deepEqual(state(engine),before);
  const second=engine.openDocument(candidate),fresh={...empty(),id:'new-session-project'};
  setTimeout(()=>engine.resetEmpty(fresh),0);await assert.rejects(second,e=>e.code==='STALE_TRANSACTION');
  assert.deepEqual(engine.document,fresh);assert.deepEqual(engine.cache,{});assert.equal(engine.historyLength,0);assert.equal(engine.dirty,false);
});
