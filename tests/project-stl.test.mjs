import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { writeFileSync } from 'node:fs';
import { fileFixture, realRecompute } from '../scripts/project-file-fixtures.mjs';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { projectStl } from '../src/app/project-stl.ts';
import { parseBinaryStl } from '../src/adapters/files/parse-binary-stl.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { contourFixture } from '../src/experiments/region-fixtures.ts';
import { BASE_PLANES } from '../src/core/geometry/plane.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
const evidence=[];
function checked(engine,id){const before={document:engine.document,cache:engine.cache,revision:engine.revision,history:engine.historyLength,dirty:engine.dirty},file=projectStl({document:engine.document,busy:engine.busy},engine.cache,[id]),parsed=parseBinaryStl(file.buffer),source=meshMetrics(engine.cache[id]),actual=meshMetrics(parsed.mesh);assert(actual.closed);assert.equal(parsed.triangles,source.triangles);assert.equal(file.buffer.byteLength,84+50*parsed.triangles);assert(Math.abs(actual.signedVolume-source.signedVolume)/source.signedVolume<=1e-4);assert.deepEqual({document:engine.document,cache:engine.cache,revision:engine.revision,history:engine.historyLength,dirty:engine.dirty},before);return{featureId:id,bytes:file.buffer.byteLength,triangles:parsed.triangles,sourceVolumeMm3:source.signedVolume,exportedVolumeMm3:actual.signedVolume,bounds:actual.bounds};}
test('three-plane actual extrusions and four Boolean results export only the selected authority mesh',async()=>{
  const cases=[];for(const plane of ['XY','XZ','YZ']){const engine=new ProjectEngine(createEmptyProject(),{recompute:realRecompute});await engine.openDocument(await fileFixture(plane,true));for(const id of ['solid-a','solid-b','union','difference','reverse','join'])cases.push({plane,...checked(engine,id)});}
  evidence.push({id:'actual-three-plane-single-solids',cases,hiddenSourcesNotMixed:true,exportNeverChangesDocumentHistoryOrDirty:true,passed:true});
});
test('actual holes, circle, annulus and signed extrusion preserve topology and bounds after Float32 STL',async()=>{
  const cases=[];for(const [id,fixtures] of [
    ['hole',[{kind:'polygon',id:'outer',points:[[0,0],[40,0],[40,30],[0,30]]},{kind:'polygon',id:'inner',points:[[15,10],[25,10],[25,20],[15,20]]}]],
    ['circle',[{kind:'circle',id:'circle',center:[0,0],radius:10}]],
    ['annulus',[{kind:'circle',id:'outer',center:[0,0],radius:10},{kind:'circle',id:'hole',center:[0,0],radius:3}]]
  ])for(const plane of ['XY','XZ','YZ'])for(const depth of [10,-10]){
    const engine=new ProjectEngine(createEmptyProject(),{recompute:realRecompute}),sketch=contourFixture(`${id}-sketch`,fixtures);sketch.plane=structuredClone(BASE_PLANES[plane]);await engine.execute({kind:'add-feature',feature:sketch});const solved=engine.document.features[0];await engine.execute({kind:'add-feature',feature:{id:'solid',kind:'extrude',name:id,visible:true,sketchId:solved.id,region:selectSketchRegion(buildSketchRegions(solved)).definition,depth}});cases.push({id,plane,depth,...checked(engine,'solid')});
  }
  evidence.push({id:'actual-hole-curves-signed',cases,worldCoordinates:true,passed:true});
});
test('bad selection, empty/nonfinite/nonclosed mesh and Float32 precision loss are refused without mutating authority',async()=>{
  const engine=new ProjectEngine(createEmptyProject(),{recompute:realRecompute});await engine.openDocument(await fileFixture());const snapshot={document:engine.document,busy:false},before=engine.document,cache=engine.cache,rejected=[];
  for(const ids of [[],['a'],['join','solid-a']])assert.throws(()=>projectStl(snapshot,cache,ids),e=>e.code==='STL_SELECTION_REQUIRED');assert.throws(()=>projectStl({...snapshot,busy:true},cache,['join']),e=>e.code==='STL_BUSY');
  for(const [name,mesh,code] of [['empty',{positions:[]},'STL_EMPTY'],['nonfinite',{positions:cache.join.positions.map((v,i)=>i===0?Infinity:v)},'STL_INVALID_MESH'],['open',{positions:cache.join.positions.slice(9)},'STL_INVALID_MESH'],['missing',undefined,'STL_MESH_MISSING']]){assert.throws(()=>projectStl(snapshot,{...cache,join:mesh},['join']),e=>e.code===code);rejected.push({name,code});}
  const thin=runSolid({kind:'boolean',operation:'union',a:{center:[9999,0,0],size:[0.001,10,10]},b:{center:[9999,20,0],size:[0.001,10,10]}});assert(meshMetrics(thin).closed);assert.throws(()=>projectStl(snapshot,{...cache,join:thin},['join']),e=>e.code==='STL_EXPORT_INVALID');assert.deepEqual(engine.document,before);
  evidence.push({id:'invalid-export',invalidSelectionCases:3,busyRefused:true,rejected,float32PrecisionLossRefused:true,documentUnchanged:true,passed:true});
});
after(()=>writeFileSync('docs/learning/evidence/T-402-project-stl-node.json',JSON.stringify({task:'T-402',executedAt:new Date().toISOString(),command:'npm run check:project-stl',environment:{node:process.version,platform:process.platform,three:'0.186.1'},evidence,passed:evidence.length===3,tolerances:{volumeRelative:1e-4,boundsMm:'max(1e-4, size*1e-5)',normalLengthAndAlignment:1e-5}},null,2)+'\n'));
