import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runSolid, booleanBoxes } from '../src/adapters/solid/solid-spike.ts';
import { exportBinaryStl } from '../src/adapters/solid/stl-spike.ts';
import { parseBinaryStl } from '../src/experiments/parse-binary-stl.ts';
import { runSolidFixtures, solidFixtures, checkSolid } from '../src/experiments/solid-fixtures.ts';
import { meshMetrics, requireSolid } from '../src/core/geometry/mesh-metrics.ts';

const cases=await runSolidFixtures(async input=>runSolid(input));
const raw=meshMetrics(booleanBoxes(solidFixtures[0].input,false));
const stl=[];
mkdirSync(new URL('../.research/stl/',import.meta.url),{recursive:true});
for(const fixture of solidFixtures.filter(f=>f.expectedVolumeMm3>0)) {
  const buffer=exportBinaryStl(runSolid(fixture.input));
  const parsed=parseBinaryStl(buffer),checked=checkSolid(fixture,parsed.mesh);
  writeFileSync(new URL(`../.research/stl/${fixture.id}.stl`,import.meta.url),Buffer.from(buffer));
  stl.push({id:fixture.id,bytes:buffer.byteLength,triangles:parsed.triangles,actual:checked.actual,
    volumeRelativeError:checked.volumeRelativeError,sha256:createHash('sha256').update(Buffer.from(buffer)).digest('hex')});
}
assert.throws(()=>parseBinaryStl(new ArrayBuffer(83)),/INVALID_STL/);
const damaged=exportBinaryStl(runSolid(solidFixtures[0].input));
new DataView(damaged).setUint32(80,99999,true);
assert.throws(()=>parseBinaryStl(damaged),/count\/length/);
const invalid=[];
for(const [id,input] of [
  ['NaN-center',{...solidFixtures[0].input,a:{center:[NaN,0,0],size:[20,20,20]}}],
  ['zero-size',{...solidFixtures[0].input,a:{center:[0,0,0],size:[0,20,20]}}],
  ['unknown-operation',{...solidFixtures[0].input,operation:'bad'}],
  ['zero-depth',{kind:'hole-extrusion',plane:'XY',depth:0}],
  ['unknown-plane',{kind:'hole-extrusion',plane:'bad',depth:10}],
]) { assert.throws(()=>runSolid(input),/INVALID/); invalid.push({id,actual:'rejected'}); }
const degeneracies=[];
for(const [id,center] of [['edge-touch',[20,20,0]],['vertex-touch',[20,20,20]]]) {
  const input={kind:'boolean',operation:'union',a:{center:[0,0,0],size:[20,20,20]},b:{center,size:[20,20,20]}};
  const metrics=meshMetrics(booleanBoxes(input,false));
  assert.throws(()=>runSolid(input),/INVALID_SOLID/);
  degeneracies.push({id,input,rawMetrics:metrics,actual:'explicitly rejected non-manifold union'});
}
// Broken and reversed mesh fixtures verify the independent checker rejects bad geometry.
const valid=runSolid(solidFixtures[0].input);
assert.throws(()=>requireSolid({positions:valid.positions.slice(9)}),/INVALID_SOLID/);
const reverse={positions:[]};
for(let i=0;i<valid.positions.length;i+=9) reverse.positions.push(...valid.positions.slice(i,i+3),...valid.positions.slice(i+6,i+9),...valid.positions.slice(i+3,i+6));
assert.throws(()=>requireSolid(reverse),/INVALID_SOLID/);
const vendor=readFileSync(new URL('../src/adapters/solid/vendor/csg-lib.js',import.meta.url));
const source=JSON.parse(readFileSync(new URL('../docs/third-party/csg-source.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(vendor).digest('hex'),source.source.sha256);
const evidence={task:'T-004',executedAt:new Date().toISOString(),command:'npm run check:solid',
  environment:{node:process.version,platform:process.platform,arch:process.arch,three:'0.186.1'},
  tolerances:{weldMm:1e-6,volumeRelative:1e-4,boundsMm:4e-4},cases,
  rawFanTriangulation:{fixture:'overlap-union',metrics:raw},stl,invalid,degeneracies,
  checkerNegativeCases:['missing triangle','all winding reversed','truncated STL','wrong STL face count'],passed:true,
  limitations:['Fixed M0 straight-edge profiles; general contours/curves are future tasks.','Conformity bridge capped at 2000 vertices; no industrial robustness claim.']};
writeFileSync(new URL('../docs/learning/evidence/T-004-solid-node.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(`PASS: ${cases.length} numerical cases; ${stl.length} independent STL round trips; ${degeneracies.length} explicit non-manifold errors.`);
