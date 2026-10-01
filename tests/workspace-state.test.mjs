import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialWorkspaceState, transitionWorkspace as step } from '../src/app/workspace-state.ts';

const ready=()=>step(step(initialWorkspaceState(),{type:'load'}),{type:'loaded',generation:1});
test('old load completions cannot replace a newer retry or an error',()=>{
  const first=step(initialWorkspaceState(),{type:'load'}),retry=step(first,{type:'load'});
  assert.equal(step(retry,{type:'loaded',generation:1}),retry);
  const failed=step(retry,{type:'load-failed',generation:2,message:'503'});
  assert.equal(failed.computation,'error');assert.equal(step(failed,{type:'loaded',generation:2}),failed);
  assert.equal(step(step(failed,{type:'load'}),{type:'loaded',generation:3}).computation,'ready');
});
test('drawing requires a sketch; cancel preserves sketch editing context and clears transient selection',()=>{
  assert.throws(()=>step(ready(),{type:'mode',mode:'sketch.drawLine'}),/SKETCH_REQUIRED/);
  let state=step(ready(),{type:'mode',mode:'sketch.drawLine',sketchId:'s1'});
  state=step(state,{type:'select',ids:['p1','p1','p2']});assert.deepEqual(state.selectionIds,['p1','p2']);
  const cancel=step(state,{type:'cancel'});assert.equal(cancel.mode,'sketch.select');assert.equal(cancel.activeSketchId,'s1');
  assert.deepEqual(cancel.selectionIds,[]);assert.deepEqual(state.selectionIds,['p1','p2']);
  const model=step(cancel,{type:'mode',mode:'model.select'});assert.equal(model.activeSketchId,null);
});
test('compute state prevents incompatible mode changes and ignores stale completion',()=>{
  const state=step(ready(),{type:'compute'});assert.equal(state.computation,'running');
  assert.throws(()=>step(state,{type:'mode',mode:'model.select'}),/MODE_UNAVAILABLE/);
  assert.equal(step(state,{type:'computed',generation:1}),state);
  assert.equal(step(state,{type:'computed',generation:2}).computation,'ready');
});
test('reload clears stale selection and sketch context; loading does not react to selection/cancel',()=>{
  const selected=step(step(ready(),{type:'mode',mode:'sketch.select',sketchId:'s1'}),{type:'select',ids:['p1']});
  const loading=step(selected,{type:'load'});assert.deepEqual(loading.selectionIds,[]);assert.equal(loading.activeSketchId,null);
  assert.equal(step(loading,{type:'select',ids:['p1']}),loading);assert.equal(step(loading,{type:'cancel'}),loading);
  assert.throws(()=>step(ready(),{type:'select',ids:['']}),/INVALID_SELECTION/);
});
