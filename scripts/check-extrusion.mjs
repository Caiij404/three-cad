import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { runExtrusionFixtures } from '../src/experiments/extrusion-fixtures.ts';
import { contourFixture } from '../src/experiments/region-fixtures.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
import { sampleSketchEntity } from '../src/core/geometry/sample-entity.ts';
import { cross, toWorld } from '../src/core/geometry/plane.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
const errors = [], module = await createModule({ printErr: e => errors.push(e) });
const evidence = await runExtrusionFixtures(async input => solveDomainSketch(module, input), async input => runSolid(input));
assert.equal(evidence.cases.length, 60); assert.equal(evidence.invalid.length, 10); assert.equal(errors.length, 0, errors.join('\n'));
const boundaryChecks = [];
const firstInput = evidence.cases[0].input;
for (const depth of [NaN, Infinity, -Infinity]) {
  assert.throws(() => runSolid({ ...firstInput, depth }), e => e.code === 'INVALID_EXTRUSION_DEPTH'); boundaryChecks.push({ id: `nonfinite-depth-${String(depth)}`, actualCode: 'INVALID_EXTRUSION_DEPTH' });
}
assert.throws(() => runSolid({ ...firstInput, sketch: {} }), e => e.code === 'INVALID_EXTRUSION_INPUT'); boundaryChecks.push({ id: 'malformed-sketch', actualCode: 'INVALID_EXTRUSION_INPUT' });
const wrongPlane = structuredClone(firstInput); wrongPlane.sketch.plane.u = [2, 0, 0]; assert.throws(() => runSolid(wrongPlane), e => e.code === 'SCHEMA_INVALID'); boundaryChecks.push({ id: 'nonunit-plane', actualCode: 'SCHEMA_INVALID' });
const large = solveDomainSketch(module, { sketch: contourFixture('large-circle', [{ kind: 'circle', id: 'circle', center: [0, 0], radius: 10000 }]) }); assert(large.sketch);
const largeInput = { kind: 'sketch-extrusion', sketch: large.sketch, region: selectSketchRegion(buildSketchRegions(large.sketch)).definition, depth: 1 };
const largeActual = meshMetrics(runSolid(largeInput)); assert(largeActual.closed); assert(Math.abs(largeActual.signedVolume - 1e8 * Math.PI) / (1e8 * Math.PI) <= 0.01);
boundaryChecks.push({ id: 'radius-workspace-limit', input: largeInput, expectedVolumeMm3: 1e8 * Math.PI, actual: largeActual, segmentCount: sampleSketchEntity(large.sketch, 'circle').segmentCount });
const extremaSource = contourFixture('oblique-analytic-extrema', [{ kind: 'circle', id: 'circle', center: [0, 0], radius: 9999.98 }]);
extremaSource.plane = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, Math.SQRT1_2, Math.SQRT1_2] };
const extrema = solveDomainSketch(module, { sketch: extremaSource }); assert(extrema.sketch);
const depth = (10000 - 9999.98 * Math.SQRT1_2 + 0.01) / Math.SQRT1_2, normal = cross(extrema.sketch.plane.u, extrema.sketch.plane.v);
const sampledMaxAbsWorldMm = Math.max(...sampleSketchEntity(extrema.sketch, 'circle').points.flatMap(p => toWorld(extrema.sketch.plane, p).map((n, a) => Math.abs(n + normal[a] * depth))));
assert(sampledMaxAbsWorldMm < 10000);
const extremaInput = { kind: 'sketch-extrusion', sketch: extrema.sketch, region: selectSketchRegion(buildSketchRegions(extrema.sketch)).definition, depth };
assert.throws(() => runSolid(extremaInput), e => e.code === 'EXTRUSION_WORKSPACE_RANGE');
boundaryChecks.push({ id: 'extruded-analytic-extremum-between-samples', input: extremaInput, sampledMaxAbsWorldMm, trueMaxWorldMm: 10000.01, actualCode: 'EXTRUSION_WORKSPACE_RANGE' });
writeFileSync('docs/learning/evidence/T-202C1-extrusion-node.json', JSON.stringify({ task: 'T-202C1', executedAt: new Date().toISOString(), command: 'npm run check:extrusion',
  environment: { node: process.version, platform: process.platform, three: '0.186.1', solver: 'unchanged SolveSpace 2879a02d WASM' }, ...evidence, boundaryChecks, nativeErrors: errors, passed: true,
  limitations: ['Adapter/geometry only; no user extrusion selection, preview/cancel, transactions or full REQ-006 UI acceptance.'] }, null, 2) + '\n');
console.log('PASS: 60 real solved general extrusions, three planes/±depth/hole/curves/oblique/collinear/bounds/normals; 10 invalid inputs and recovery.');
