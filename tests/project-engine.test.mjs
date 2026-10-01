import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { writeFileSync } from 'node:fs';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { empty, sketch, extrusion } from './fixtures/domain-document.mjs';
const code=expected=>error=>error.code===expected;
const geometryEvidence=[];
const derive=async document=>{
  const cache={};
  // Real CSG mesh for this fixed axis-aligned rectangle fixture; not a generic extrude adapter.
  for(const feature of document.features.filter(f=>f.kind==='extrude')){
    const source=document.features.find(f=>f.id===feature.sketchId),xs=source.points.map(p=>p.position[0]),ys=source.points.map(p=>p.position[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const box={center:[(minX+maxX)/2,(minY+maxY)/2,feature.depth/2],size:[maxX-minX,maxY-minY,Math.abs(feature.depth)]};
    cache[feature.id]=runSolid({kind:'boolean',operation:'union',a:box,b:box});
  }
  return {document,cache};
};
test('metadata commands undo/redo, clear redo branch, skip no-op and preserve stable IDs',async()=>{
  const engine=new ProjectEngine(empty());const id=engine.document.id;
  assert.equal(await engine.execute({kind:'rename-project',name:engine.document.name}),false);assert.equal(engine.historyLength,0);
  await engine.execute({kind:'rename-project',name:'A'});await engine.execute({kind:'rename-project',name:'B'});
  engine.undo();assert.equal(engine.document.name,'A');engine.redo();assert.equal(engine.document.name,'B');engine.undo();
  await engine.execute({kind:'rename-project',name:'C'});assert.equal(engine.canRedo,false);assert.equal(engine.document.id,id);assert.equal(engine.revision,6);
});
test('saved snapshot fingerprint survives undo and correctly handles delayed save and project reset',async()=>{
  const engine=new ProjectEngine(empty());const original=engine.captureSave();
  await engine.execute({kind:'rename-project',name:'A'});const savedA=engine.captureSave();engine.markSaved(savedA);assert.equal(engine.dirty,false);
  await engine.execute({kind:'rename-project',name:'B'});assert(engine.dirty);engine.undo();assert.equal(engine.dirty,false);engine.undo();assert(engine.dirty);
  engine.markSaved(original);assert.equal(engine.dirty,false);engine.redo();assert(engine.dirty);
  engine.markSaved(savedA);assert.equal(engine.dirty,false);
  engine.resetEmpty({...empty(),id:'project-2'});assert.equal(engine.historyLength,0);assert.equal(engine.dirty,false);assert.equal(engine.markSaved(savedA),false);
});
test('geometry without real recompute refuses to commit; candidate failure preserves history and mesh cache',async()=>{
  const engine=new ProjectEngine(empty());await assert.rejects(engine.execute({kind:'add-feature',feature:sketch()}),code('RECOMPUTE_REQUIRED'));
  assert.equal(engine.document.features.length,0);assert.equal(engine.historyLength,0);assert.equal(engine.revision,0);
  const failing=new ProjectEngine(empty(),{recompute:async()=>{throw new Error('actual recompute failure');}});
  await assert.rejects(failing.execute({kind:'add-feature',feature:sketch()}),/recompute failure/);assert.equal(failing.historyLength,0);assert.equal(failing.dirty,false);assert.equal(failing.busy,false);
});
test('real mesh cache is atomically committed/restored with domain geometry and IDs',async()=>{
  const engine=new ProjectEngine(empty(),{recompute:derive});
  await engine.execute({kind:'add-feature',feature:sketch()});await engine.execute({kind:'add-feature',feature:extrusion()});
  const record=(stage,expected)=>{const metrics=meshMetrics(engine.cache['extrude-1']);assert(Math.abs(metrics.signedVolume-expected)<1e-8);
    geometryEvidence.push({stage,featureId:'extrude-1',depth:engine.document.features.find(f=>f.id==='extrude-1').depth,expectedVolumeMm3:expected,
      actualVolumeMm3:metrics.signedVolume,toleranceAbsoluteMm3:1e-8,closed:metrics.closed,revision:engine.revision});};
  record('committed depth 20',8000);
  const changed=engine.document.features.find(f=>f.id==='extrude-1');changed.depth=30;
  await engine.execute({kind:'replace-feature',feature:changed});record('committed depth 30',12000);
  engine.undo();assert.equal(engine.document.features[1].depth,20);record('undo',8000);
  engine.redo();assert.equal(engine.document.features[1].id,'extrude-1');record('redo',12000);
  const leaked=engine.cache;leaked['extrude-1'].positions[0]=999;assert.notEqual(engine.cache['extrude-1'].positions[0],999);
});
test('recompute must preserve IDs/definitions and provide valid nonempty or explicit empty derived mesh',async()=>{
  for(const recompute of [
    async document=>({document:{...document,id:'changed'},cache:{}}),
    async document=>({document:{...document,name:'smuggled'},cache:{}}),
  ]){const engine=new ProjectEngine(empty(),{recompute});await assert.rejects(engine.execute({kind:'add-feature',feature:sketch()}),e=>['RECOMPUTE_ID_CHANGED','RECOMPUTE_DEFINITION_CHANGED'].includes(e.code));assert.equal(engine.historyLength,0);}
  const engine=new ProjectEngine(empty(),{recompute:async document=>({document,cache:{}})});
  await engine.execute({kind:'add-feature',feature:sketch()});await assert.rejects(engine.execute({kind:'add-feature',feature:extrusion()}),code('MISSING_DERIVED'));
});
test('busy rejects conflicting commands/undo; new project invalidates late replies without clearing newer busy state',async()=>{
  const resolutions=[];const engine=new ProjectEngine(empty(),{recompute:document=>new Promise(r=>{resolutions.push(()=>r({document,cache:{}}));})});
  const pending=engine.execute({kind:'add-feature',feature:sketch()}),rejection=assert.rejects(pending,code('STALE_TRANSACTION'));
  assert(engine.busy);assert.throws(()=>engine.undo(),code('TRANSACTION_BUSY'));
  await assert.rejects(engine.execute({kind:'rename-project',name:'wrong'}),code('TRANSACTION_BUSY'));
  engine.resetEmpty({...empty(),id:'new-project'});
  const newer=engine.execute({kind:'add-feature',feature:sketch('new-sketch')});
  resolutions[0]();await rejection;assert(engine.busy,'old finally must not clear the new transaction');
  assert.equal(engine.document.id,'new-project');assert.equal(engine.document.features.length,0);assert.equal(engine.historyLength,0);
  resolutions[1]();await newer;assert.equal(engine.document.features[0].id,'new-sketch');assert.equal(engine.busy,false);
});
test('failure after an existing real geometry snapshot preserves document, cache, history and saved fingerprint',async()=>{
  let failing=false;const engine=new ProjectEngine(empty(),{recompute:async doc=>{if(failing)throw new Error('CSG failure');return derive(doc);}});
  await engine.execute({kind:'add-feature',feature:sketch()});await engine.execute({kind:'add-feature',feature:extrusion()});
  engine.markSaved(engine.captureSave());const before=engine.document,cache=engine.cache,revision=engine.revision;
  const changed=engine.document.features[1];changed.depth=30;failing=true;
  await assert.rejects(engine.execute({kind:'replace-feature',feature:changed}),/CSG failure/);
  assert.deepEqual(engine.document,before);assert.deepEqual(engine.cache,cache);assert.equal(engine.revision,revision);assert.equal(engine.historyLength,2);assert.equal(engine.dirty,false);
});
test('feature rename/visibility do not recompute geometry; stable ID role cannot be reassigned',async()=>{
  let calls=0;const engine=new ProjectEngine(empty(),{recompute:async doc=>{calls++;return derive(doc);}});
  await engine.execute({kind:'add-feature',feature:sketch()});await engine.execute({kind:'add-feature',feature:extrusion()});
  const cache=engine.cache;await engine.execute({kind:'rename-feature',id:'extrude-1',name:'Renamed'});await engine.execute({kind:'visibility',id:'extrude-1',visible:false});
  assert.equal(calls,2);assert.deepEqual(engine.cache,cache);assert.equal(engine.document.features[1].visible,false);
  const changed=engine.document.features[0];changed.entities[0].id=changed.constraints[0].id;changed.constraints=[];
  await assert.rejects(engine.execute({kind:'replace-feature',feature:changed}),code('ID_ROLE_CHANGED'));
});
test('cascade intent is explicit; deletion undo restores geometry; discarded/deleted IDs cannot be reassigned',async()=>{
  const engine=new ProjectEngine(empty(),{recompute:derive});await engine.execute({kind:'add-feature',feature:sketch()});await engine.execute({kind:'add-feature',feature:extrusion()});
  await assert.rejects(engine.execute({kind:'delete-feature',id:'sketch-1',cascade:false}),code('DEPENDENTS_EXIST'));
  await engine.execute({kind:'delete-feature',id:'sketch-1',cascade:true});assert.deepEqual(engine.document.features,[]);assert.deepEqual(engine.cache,{});
  await assert.rejects(engine.execute({kind:'add-feature',feature:sketch()}),code('ID_REUSED'));
  engine.undo();assert.equal(engine.document.features.length,2);assert(Math.abs(meshMetrics(engine.cache['extrude-1']).signedVolume-8000)<1e-8);
});
test('at least the most recent 100 successful commands remain; failed commands do not consume capacity',async()=>{
  const engine=new ProjectEngine(empty());for(let i=0;i<105;i++)await engine.execute({kind:'rename-project',name:`N${i}`});
  await assert.rejects(engine.execute({kind:'rename-project',name:''}),code('SCHEMA_INVALID'));assert.equal(engine.historyLength,100);
  for(let i=0;i<100;i++)assert(engine.undo());assert.equal(engine.document.name,'N4');assert.equal(engine.undo(),false);
});
test('explicit pending cancellation leaves document/history unchanged and rejects a later result without clearing a new command',async()=>{
  let resolve;
  const engine=new ProjectEngine(empty(),{recompute:async candidate=>new Promise(done=>{resolve=()=>done({document:candidate,cache:{}});})});
  const before=engine.document,pending=engine.execute({kind:'add-feature',feature:sketch()});
  assert(engine.busy);assert(engine.cancelPending());assert(!engine.busy);assert.equal(engine.cancelPending(),false);
  assert.deepEqual(engine.document,before);assert.equal(engine.historyLength,0);
  await engine.execute({kind:'rename-project',name:'newer'});resolve();await assert.rejects(pending,code('STALE_TRANSACTION'));
  assert.equal(engine.document.name,'newer');assert.equal(engine.historyLength,1);assert(!engine.busy);
});
after(()=>writeFileSync(new URL(process.env.TRANSACTION_EVIDENCE_PATH ?? '../docs/learning/evidence/T-102-transaction-geometry.json',import.meta.url),JSON.stringify({task:process.env.DOMAIN_EVIDENCE_TASK ?? 'T-102',executedAt:new Date().toISOString(),
  environment:{node:process.version,three:'0.186.1',csg:'8bd00fe9'},fixture:'tests/fixtures/domain-document.mjs: XY 20×20 straight rectangle, depth 20→30',
  recomputeMethod:'Real fixed CSG identity union produces the box cache for this fixture; not a general contour/extrude adapter.',measurements:geometryEvidence,
  passed:geometryEvidence.length===4},null,2)+'\n'));
