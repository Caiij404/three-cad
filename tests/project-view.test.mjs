import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { writeFileSync } from 'node:fs';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { validateProjectView } from '../src/core/model/validate-document.ts';
const evidence=[];
const view={position:[80000,-30000,20000],target:[0,0,0],up:[0,0,1],projection:'orthographic',zoom:2.5};
test('camera metadata has no geometry history/revision and remains independent through undo/redo and save dirty',async()=>{
  const engine=new ProjectEngine(createEmptyProject());const revision=engine.revision;
  assert(engine.setView(view));assert.equal(engine.revision,revision);assert.equal(engine.historyLength,0);assert(engine.dirty);assert(!engine.setView(view));
  engine.markSaved(engine.captureSave());assert(!engine.dirty);await engine.execute({kind:'rename-project',name:'A'});
  const navigation={...view,zoom:3};engine.setView(navigation);const prior=engine.historyLength;
  engine.undo();assert.deepEqual(engine.document.view,navigation);assert(engine.dirty);engine.redo();assert.deepEqual(engine.document.view,navigation);assert.equal(engine.historyLength,prior);
  engine.undo();engine.setView(view);assert(!engine.dirty);const leaked=engine.document.view;leaked.position[0]=0;assert.equal(engine.document.view.position[0],80000);
  evidence.push({id:'navigation-history-and-dirty',cameraOutsideGeometryWorkspaceAccepted:true,independentHistoryRevision:true,undoRedoKeepsLatestNavigation:true,dirtyUsesCameraAndGeometry:true,passed:true});
});
test('camera navigation during a held geometry transaction survives commit; opening restores file camera instead',async()=>{
  let resolve;const engine=new ProjectEngine(createEmptyProject(),{recompute:document=>new Promise(done=>{resolve=()=>done({document,cache:{},diagnostics:{}});})});
  const sketch={id:'empty',kind:'sketch',name:'空',visible:true,plane:{origin:[0,0,0],u:[1,0,0],v:[0,1,0]},points:[],entities:[],constraints:[]};
  const pending=engine.execute({kind:'add-feature',feature:sketch});assert(engine.busy);engine.setView(view);resolve();await pending;assert.deepEqual(engine.document.view,view);
  const file=engine.document;file.view={...view,zoom:7};const open=engine.openDocument(file);engine.setView({...view,zoom:4});resolve();await open;assert.deepEqual(engine.document.view,file.view);assert(!engine.dirty);
  evidence.push({id:'busy-navigation-and-open',heldCommitKeepsLatestView:true,openRestoresFileView:true,passed:true});
});
test('invalid camera metadata is refused before replacing the current document',()=>{
  const engine=new ProjectEngine(createEmptyProject()),before=engine.document;
  for(const candidate of [{...view,zoom:0.001},{...view,zoom:10001},{...view,position:[Infinity,0,0]},{...view,up:[0,0,0]},{...view,target:view.position}]){
    assert.throws(()=>validateProjectView(candidate),e=>e.code==='SCHEMA_INVALID');assert.throws(()=>engine.setView(candidate),e=>e.code==='SCHEMA_INVALID');assert.deepEqual(engine.document,before);
  }
  evidence.push({id:'invalid-camera',invalidInputs:5,documentUnchanged:true,passed:true});
});
after(()=>writeFileSync('docs/learning/evidence/T-401B-project-view-node.json',JSON.stringify({task:'T-401B',executedAt:new Date().toISOString(),command:'node --test tests/project-view.test.mjs',environment:{node:process.version,platform:process.platform},evidence,passed:evidence.length===3},null,2)+'\n'));
