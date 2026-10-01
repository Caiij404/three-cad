import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProjectJson, serializeProject, validateDocument } from '../src/core/model/validate-document.ts';
import { descendants, topologicalOrder } from '../src/core/features/dependency-graph.ts';
import { model, empty } from './fixtures/domain-document.mjs';
const rejects=(document,code)=>assert.throws(()=>validateDocument(document),error=>error.code===code);
test('JSON round trip preserves IDs, geometry definitions, visibility and view; returns an independent object',()=>{
  const document=model();document.features[1].visible=false;document.name='<script>not executed</script>';
  const parsed=parseProjectJson(serializeProject(document));assert.deepEqual(parsed,document);
  parsed.features[0].points[0].position[0]=1;assert.equal(document.features[0].points[0].position[0],0);
  assert(!serializeProject(document).includes('positions'));assert(!serializeProject(document).includes('history'));
});
test('unknown schema, runtime objects/fields, NaN/Infinity and oversized files are rejected',()=>{
  for(const version of [0,2,'1']){const doc=empty();doc.schemaVersion=version;rejects(doc,'UNSUPPORTED_SCHEMA');}
  for(const value of [NaN,Infinity,10001]){const doc=model();doc.features[0].points[0].position[0]=value;rejects(doc,'SCHEMA_INVALID');}
  const extra=empty();extra.mesh={};rejects(extra,'SCHEMA_INVALID');
  assert.throws(()=>parseProjectJson('{'),e=>e.code==='INVALID_JSON');
  assert.throws(()=>parseProjectJson(' '.repeat(10*1024*1024+1)),e=>e.code==='FILE_TOO_LARGE');
  const sparse=empty();sparse.view.position=[100,,100];rejects(sparse,'SCHEMA_INVALID');
});
test('duplicate global IDs and point/constraint/region references cannot escape their sketch',()=>{
  let doc=model();doc.features[0].points[0].id=doc.id;rejects(doc,'REFERENCE_MISSING');
  doc=model();doc.features[0].constraints[0].id=doc.id;rejects(doc,'DUPLICATE_ID');
  doc=model();doc.features[0].entities[0].startPointId='sketch-2-p0';rejects(doc,'REFERENCE_MISSING');
  doc=model();doc.features[0].constraints[0].refs=[{entityId:'sketch-1-line0'}];rejects(doc,'REFERENCE_TYPE');
  doc=model();doc.features[1].region.outerEntityIds=['sketch-2-line0'];rejects(doc,'REFERENCE_MISSING');
});
test('entity/constraint dimensions and plane/view invariants are checked',()=>{
  for(const mutate of [
    doc=>{doc.features[0].entities[0].endPointId='sketch-1-p0';},
    doc=>{doc.features[0].plane.v=[1,0,0];},
    doc=>{doc.features[1].depth=0;},
    doc=>{doc.features[1].depth=0.009;},
    doc=>{doc.features[0].constraints[0].fixedPosition=undefined;},
    doc=>{doc.view.zoom=0;},
  ]){const doc=model();mutate(doc);rejects(doc,'SCHEMA_INVALID');}
  const doc=model();doc.features[0].constraints.push({id:'radius-wrong',kind:'radius',refs:[{entityId:'sketch-1-line0'}],value:10});rejects(doc,'REFERENCE_TYPE');
  for(const angle of [0,Math.PI,Math.PI+0.01]){
    const invalid=model();invalid.features[0].constraints.push({id:'angle-invalid',kind:'angle',refs:[{entityId:'sketch-1-line0'},{entityId:'sketch-1-line1'}],value:angle});rejects(invalid,'SCHEMA_INVALID');
  }
  const mixed=model();mixed.features[0].constraints.push({id:'distance-mixed',kind:'distance',refs:[{pointId:'sketch-1-p0'},{entityId:'sketch-1-line0'}],value:10});rejects(mixed,'REFERENCE_TYPE');
  const valid=model();valid.features[1].depth=-0.01;validateDocument(valid);
});
test('DAG ordering and descendants follow references, not array order; cycle and wrong operand kinds fail',()=>{
  const document=model();document.features.reverse();validateDocument(document);
  const order=topologicalOrder(document.features);assert(order.indexOf('sketch-1')<order.indexOf('extrude-1'));assert(order.indexOf('extrude-1')<order.indexOf('boolean-1'));
  assert.deepEqual(new Set(descendants(document.features,'sketch-1')),new Set(['extrude-1','boolean-1']));
  let doc=model();doc.features[4].operandAId='missing';rejects(doc,'REFERENCE_MISSING');
  doc=model();doc.features[4].operandAId='sketch-1';rejects(doc,'REFERENCE_TYPE');
  doc=model();doc.features.push({id:'boolean-2',name:'cycle',visible:true,kind:'boolean',operation:'union',operandAId:'boolean-1',operandBId:'extrude-2'});
  doc.features[4].operandAId='boolean-2';rejects(doc,'FEATURE_CYCLE');
});
