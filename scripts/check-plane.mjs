import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { BASE_PLANES, cross, toPlane, toWorld } from '../src/core/geometry/plane.ts';
const result=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/plane.test.mjs'],{encoding:'utf8'});
writeFileSync('docs/learning/evidence/T-103-plane.log',(result.stdout||'')+(result.stderr||''));
assert.equal(result.status,0,result.stdout+result.stderr);
const cases=[];
const expectedWorld={XY:[40,30,0],XZ:[40,0,30],YZ:[0,40,30]};
for(const [name,frame] of Object.entries(BASE_PLANES)){
  for(const input of [[0,0],[40,30],[-9999.123456789,0.000001],[9999.0001,-123.456789]]){
    const world=toWorld(frame,input),actual=toPlane(frame,world),errorMm=Math.hypot(actual[0]-input[0],actual[1]-input[1]);
    if(input[0]===40)assert.deepEqual(world,expectedWorld[name]);assert(errorMm<=1e-6);
    cases.push({plane:name,frame,normal:cross(frame.u,frame.v),input,world,roundTripExpected:input,roundTripActual:actual,errorMm,toleranceMm:1e-6});
  }
}
writeFileSync('docs/learning/evidence/T-103-plane.json',JSON.stringify({task:'T-103',executedAt:new Date().toISOString(),command:'npm run check:plane',environment:{node:process.version,platform:process.platform},
  tests:2,cases,passed:true,limitations:['Double coordinate contract only; Float32 display/picking is independently tested in the browser.']},null,2)+'\n');
console.log('PASS: 2 plane tests, 12 base-plane numerical records, translated-plane and invalid-input boundaries.');
