import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { sampleSketchEntity } from '../src/core/geometry/sample-entity.ts';
import { BASE_PLANES, toWorld } from '../src/core/geometry/plane.ts';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { domainArc, domainCircle, domainRectangle } from '../src/experiments/domain-solver-fixtures.ts';
const errors = [], module = await createModule({ printErr: s => errors.push(s) }), evidence = [];
const metric = (sketch, entity, sample) => {
  const center = sketch.points.find(p => p.id === entity.centerPointId)?.position;
  const radius = entity.kind === 'circle' ? entity.radius : center ? Math.hypot(...sketch.points.find(p => p.id === entity.startPointId).position.map((n, i) => n - center[i])) : 0;
  let maxChordErrorMm = 0, maxStepRadians = 0, polygonTwiceArea = 0, maxWorldRangeMm = 0;
  for (let i = 1; i < sample.points.length; i++) {
    const a = sample.points[i - 1], b = sample.points[i]; polygonTwiceArea += a[0] * b[1] - a[1] * b[0];
    if (center) {
      // Independent output geometry: midpoint radial sagitta and angle between consecutive radius vectors.
      const midpoint = a.map((n, axis) => (n + b[axis]) / 2 - center[axis]);
      maxChordErrorMm = Math.max(maxChordErrorMm, Math.abs(radius - Math.hypot(...midpoint)));
      const av = a.map((n, axis) => n - center[axis]), bv = b.map((n, axis) => n - center[axis]);
      maxStepRadians = Math.max(maxStepRadians, Math.atan2(Math.abs(av[0] * bv[1] - av[1] * bv[0]), av[0] * bv[0] + av[1] * bv[1]));
    }
    maxWorldRangeMm = Math.max(maxWorldRangeMm, ...toWorld(sketch.plane, b).map(Math.abs));
  }
  return { maxChordErrorMm, maxStepRadians, polygonSignedAreaMm2: polygonTwiceArea / 2, maxWorldRangeMm };
};
test('real solved circles and CW/CCW arcs on every plane obey both precision limits and retain endpoints', () => {
  const cases = [];
  for (const [plane, frame] of Object.entries(BASE_PLANES)) for (const original of [domainCircle(), domainArc(), domainArc(true)]) {
    original.plane = frame; const solved = solveDomainSketch(module, { sketch: original }); assert(solved.sketch); const sketch = solved.sketch, entity = sketch.entities[0];
    const before = JSON.stringify(sketch), sample = sampleSketchEntity(sketch, entity.id), measurements = metric(sketch, entity, sample);
    assert.equal(JSON.stringify(sketch), before); assert(measurements.maxChordErrorMm <= 0.05 + 1e-12); assert(measurements.maxStepRadians <= Math.PI / 36 + 1e-12);
    if (entity.kind === 'circle') { assert(sample.closed); assert(sample.segmentCount >= 24); assert.deepEqual(sample.points[0], sample.points.at(-1)); assert(measurements.polygonSignedAreaMm2 > 0); }
    else { assert.deepEqual(sample.points[0], sketch.points.find(p => p.id === entity.startPointId).position); assert.deepEqual(sample.points.at(-1), sketch.points.find(p => p.id === entity.endPointId).position); assert.equal(Math.sign(sample.sweepRadians), entity.clockwise ? -1 : 1); }
    cases.push({ plane, actualNative: { dof: solved.dof, resultCode: solved.resultCode }, solvedSketch: sketch, sample, independentMeasurements: measurements, passed: true });
  }
  evidence.push({ id: 'actual-native-three-plane-curves', cases });
});
test('large-radius chord limit dominates angle limit; tiny-circle angle limit and minimum remain intact', () => {
  const cases = [];
  for (const radius of [0.001, 10, 10000]) {
    const original = domainCircle(); original.entities[0].radius = radius; original.constraints.find(c => c.kind === 'radius').value = radius;
    const solved = solveDomainSketch(module, { sketch: original }); assert(solved.sketch); const sample = sampleSketchEntity(solved.sketch, 'circle'), measurements = metric(solved.sketch, solved.sketch.entities[0], sample);
    assert(measurements.maxChordErrorMm <= 0.05 + 1e-9); assert(measurements.maxStepRadians <= Math.PI / 36 + 1e-12); assert(sample.segmentCount >= 24 && sample.segmentCount <= 4096);
    if (radius === 10000) assert(sample.segmentCount > 72); else assert.equal(sample.segmentCount, 72);
    cases.push({ radiusMm: radius, sampleCount: sample.segmentCount, metrics: measurements, reportedBoundMm: sample.chordErrorBoundMm, actualNative: solved.dof });
  }
  const sketch = domainCircle(); const minimum = sampleSketchEntity(sketch, 'circle', { chordErrorMm: 100, maxStepDegrees: 180 }); assert.equal(minimum.segmentCount, 24);
  evidence.push({ id: 'scale-and-minimum', cases, relaxedPrecisionStill24Segments: true });
});
test('sampling a solved line preserves exact doubles without mutation', () => {
  const solved = solveDomainSketch(module, { sketch: domainRectangle() }); const sample = sampleSketchEntity(solved.sketch, 'bottom');
  assert.deepEqual(sample.points, [[0, 0], [40, 0]]); assert.equal(sample.segmentCount, 1); assert.equal(sample.chordErrorBoundMm, 0); sample.points[0][0] = 99; assert.equal(solved.sketch.points[0].position[0], 0);
  evidence.push({ id: 'exact-line', inputMm: [[0, 0], [40, 0]], cloned: true });
});
test('precision beyond 4096 segments fails explicitly instead of returning a coarser boundary', () => {
  const sketch = domainCircle(); assert.throws(() => sampleSketchEntity(sketch, 'circle', { chordErrorMm: 1e-9 }), e => e.code === 'CURVE_CAPACITY');
  evidence.push({ id: 'capacity-refusal', inputRadiusMm: 8, chordErrorMm: 1e-9, expectedCode: 'CURVE_CAPACITY', actualCode: 'CURVE_CAPACITY' });
});
test('unsolved arc radii, degenerate points, missing IDs, invalid precision and out-of-range boundary are refused', () => {
  const invalid = [];
  const run = (id, sketch, entityId, options, code) => { assert.throws(() => sampleSketchEntity(sketch, entityId, options), e => e.code === code); invalid.push({ id, code, passed: true }); };
  run('unsolved', domainArc(), 'arc', {}, 'UNSOLVED_ARC');
  const arc = domainArc(); arc.points[2].position = [10, 0]; run('same-arc-ends', arc, 'arc', {}, 'DEGENERATE_GEOMETRY');
  run('missing', domainCircle(), 'missing', {}, 'REFERENCE_MISSING');
  for (const options of [{ chordErrorMm: 0 }, { chordErrorMm: NaN }, { maxStepDegrees: 0 }, { maxStepDegrees: 181 }]) run('invalid-precision', domainCircle(), 'circle', options, 'INVALID_CURVE_PRECISION');
  const circle = domainCircle(); circle.points[0].position = [9995, 0]; run('extent-over-limit', circle, 'circle', {}, 'CURVE_WORKSPACE_RANGE');
  const betweenSamples = domainCircle(); betweenSamples.entities[0].radius = 10000; betweenSamples.points[0].position = [0, 0.01];
  run('analytic-extent-between-samples', betweenSamples, 'circle', {}, 'CURVE_WORKSPACE_RANGE');
  evidence.push({ id: 'invalid-boundaries', invalid });
});
test('preserving an arc endpoint consumes the error budget; a tighter impossible precision is refused', () => {
  const arc = domainArc(); arc.points[2].position = [0, 10 + 5e-6];
  const sample = sampleSketchEntity(arc, 'arc'); assert.deepEqual(sample.points.at(-1), [0, 10 + 5e-6]); assert(sample.chordErrorBoundMm <= 0.05);
  const measurements = metric(arc, arc.entities[0], sample); assert(measurements.maxChordErrorMm <= sample.chordErrorBoundMm + 1e-12);
  assert.throws(() => sampleSketchEntity(arc, 'arc', { chordErrorMm: 1e-6 }), e => e.code === 'CURVE_ENDPOINT_PRECISION');
  evidence.push({ id: 'endpoint-budget', inputEndMm: [0, 10 + 5e-6], sample, measurements, tightPrecisionCode: 'CURVE_ENDPOINT_PRECISION' });
});
after(() => {
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync('docs/learning/evidence/T-202A-curves.json', JSON.stringify({ task: 'T-202A', executedAt: new Date().toISOString(), command: 'npm run check:curves', environment: { node: process.version, platform: process.platform, solver: 'unchanged SolveSpace 2879a02d WASM' }, tests: 6, evidence, nativeErrors: errors, passed: evidence.length === 6,
    limitations: ['Boundary samples only; no general connectivity, self-intersection, region/hole classification, extrusion or UI accepted here.', 'Curve rendering remains the existing viewport approximation until integrated in later T-202 work.'] }, null, 2) + '\n');
});
