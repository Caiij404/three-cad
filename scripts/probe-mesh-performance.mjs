import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { performanceFixture } from '../src/experiments/performance-fixtures.ts';
const module=await createModule(),fixture=performanceFixture();
const start=performance.now(),solution=solveDomainSketch(module,{sketch:fixture.profile}),profileMs=performance.now()-start;
const lineStart=performance.now(),lineSolution=solveDomainSketch(module,{sketch:fixture.lines}),linesMs=performance.now()-lineStart;
assert(solution.sketch&&lineSolution.sketch);assert.equal(lineSolution.dof,300);
const generation=performance.now(),mesh=runSolid({kind:'sketch-extrusion',sketch:solution.sketch,region:fixture.region,depth:100}),generationMs=performance.now()-generation;
const samples=[];let actual;
for(let i=0;i<Number(process.env.PERF_METRIC_SAMPLES??4);i++){const at=performance.now();actual=meshMetrics(mesh);samples.push(performance.now()-at);if(i%5===0)console.log(`Actual ${actual.triangles} triangles: meshMetrics ${samples.at(-1).toFixed(2)}ms`);}
assert(actual.closed&&actual.windingErrors===0&&Math.abs(actual.signedVolume-fixture.analyticAreaMm2*100)/(fixture.analyticAreaMm2*100)<.001);
assert(actual.triangles*10>=100000);
const output={task:'T-403C1 diagnostic',executedAt:new Date().toISOString(),command:'node scripts/probe-mesh-performance.mjs',environment:{node:process.version,platform:process.platform},input:{lines:100,constraints:100,profileCircles:10,profileOuterRadiusMm:4000,holeRadiusMm:500,actualGeneratedSolids:1,plannedModelSolids:10},profileSolveMs:profileMs,lineSolveMs:linesMs,lineDof:lineSolution.dof,generationIncludingSolidValidationMs:generationMs,samplesIncludingWarmupMs:samples,meshHash:createHash('sha256').update(JSON.stringify(mesh.positions)).digest('hex'),metrics:actual,limitations:['Single actual solid diagnostic, not full NFR scene acceptance.','Node timings are not browser main-thread blocking or viewport FPS acceptance.']};
if(process.env.PERF_REFERENCE){const before=JSON.parse(readFileSync(process.env.PERF_REFERENCE,'utf8'));assert.deepEqual(output.metrics,before.metrics);assert.equal(output.meshHash,before.meshHash);output.exactBaselineMetricsAndCoordinates=true;}
const measured=samples.slice(1).toSorted((a,b)=>a-b);output.measuredSamples=measured.length;output.warmMeshMetricP95Ms=measured[Math.ceil(measured.length*.95)-1];
writeFileSync(process.env.MESH_PERF_PATH??'.research/T-403C1-mesh-baseline.json',JSON.stringify(output,null,2)+'\n');
