import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { drawingFeature } from '../src/core/geometry/drawing.ts';
import { BASE_PLANES } from '../src/core/geometry/plane.ts';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
const test=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/drawing.test.mjs'],{encoding:'utf8'});
writeFileSync('docs/learning/evidence/T-104B-drawing.log',test.stdout+test.stderr);assert.equal(test.status,0,test.stdout+test.stderr);
const errors=[],module=await createModule({printErr:message=>errors.push(message)}),cases=[];
const origin={position:[0,0],snap:{kind:'origin'}};
for(const [plane,frame] of Object.entries(BASE_PLANES)){
  const empty={id:`sketch-${plane}`,kind:'sketch',name:plane,visible:true,plane:frame,points:[],entities:[],constraints:[]};
  for(const [tool,samples] of [
    ['line',[origin,{position:[40,30]}]],['rectangle',[origin,{position:[40,30]}]],
    ['circle',[origin,{position:[10,0]}]],['arc',[{position:[10,0]},{position:[0,10]},{position:[-10,0]}]],
  ]){
    const input=drawingFeature(empty,tool,samples).feature,result=solveDomainSketch(module,{sketch:input});assert(result.sketch);
    for(const residual of Object.values(result.residuals))assert(residual<=1e-5);
    if(tool==='rectangle'){
      const p=result.sketch.points.map(p=>p.position);const width=Math.max(...p.map(v=>v[0]))-Math.min(...p.map(v=>v[0])),height=Math.max(...p.map(v=>v[1]))-Math.min(...p.map(v=>v[1]));
      assert(Math.abs(width-40)<=1e-5&&Math.abs(height-30)<=1e-5);assert.equal(result.sketch.constraints.filter(c=>c.kind==='coincident').length,4);
    }
    cases.push({plane,tool,input,result,expected:'real solve accepts definition; independent residual ≤1e-5; rectangle 40×30',passed:true});
  }
}
assert.equal(errors.length,0,errors.join('\n'));
writeFileSync('docs/learning/evidence/T-104B-drawing-node.json',JSON.stringify({task:'T-104B',executedAt:new Date().toISOString(),command:'npm run check:drawing',environment:{node:process.version,platform:process.platform,solver:'SolveSpace 2879a02d, unchanged WASM'},
  unitTests:3,cases,nativeErrors:errors,passed:true},null,2)+'\n');console.log('PASS: 3 drawing tests and 12 real native shape/plane combinations.');
