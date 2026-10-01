import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { contourFixture, RECTANGLE_40_30, RECTANGLE_HOLE_10 } from '../src/experiments/region-fixtures.ts';
import { buildSketchRegions, selectSketchRegion, resolveSketchRegion, polygonArea } from '../src/core/geometry/sketch-regions.ts';
import { boundaryCurve, curveContacts, insideAnalyticLoop } from '../src/core/geometry/curve-contact.ts';
import { sampleSketchEntity } from '../src/core/geometry/sample-entity.ts';
const errors = [], module = await createModule({ printErr: e => errors.push(e) }), evidence = [];
function solve(input) {
  const before = JSON.stringify(input), result = solveDomainSketch(module, { sketch: input }); assert(result.sketch, input.id);
  assert.equal(JSON.stringify(input), before); assert.equal(result.dof, 0, input.id);
  assert(Object.values(result.residuals).every(r => r <= 1e-5));
  return { sketch: result.sketch, native: { dof: result.dof, resultCode: result.resultCode, residuals: result.residuals } };
}
const outer = { kind: 'polygon', id: 'outer', points: RECTANGLE_40_30 };
const circle = (id, center, radius) => ({ kind: 'circle', id, center, radius });
const reject = (sketch, code, options) => assert.throws(() => buildSketchRegions(sketch, options), e => e.code === code && e.path === sketch.id);
function independentPolylineGap(a, b) {
  const sub = (p, q) => p.map((v, i) => v - q[i]), cross = (p, q) => p[0] * q[1] - p[1] * q[0];
  const pointSegment = (p, a, b) => { const u = sub(b, a), v = sub(p, a), t = Math.max(0, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (u[0] ** 2 + u[1] ** 2))); return Math.hypot(...p.map((n, i) => n - a[i] - t * u[i])); };
  let gap = Infinity;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const p = a[i - 1], q = a[i], r = b[j - 1], s = b[j], u = sub(q, p), v = sub(s, r), w = sub(r, p), den = cross(u, v);
    if (den !== 0) { const t = cross(w, v) / den, h = cross(w, u) / den; if (t >= 0 && t <= 1 && h >= 0 && h <= 1) return 0; }
    gap = Math.min(gap, pointSegment(p, r, s), pointSegment(q, r, s), pointSegment(r, p, q), pointSegment(s, p, q));
  }
  return gap;
}

test('real rectangle/hole loops on three planes have exact source IDs, normalized winding and independent areas', () => {
  const cases = [];
  for (const plane of ['XY', 'XZ', 'YZ']) for (const reverseEdges of [false, true]) {
    const actual = solve(contourFixture(`hole-${plane}-${reverseEdges}`, [{ ...outer, reverseEdges, separateEndpoints: true }, { kind: 'polygon', id: 'hole', points: RECTANGLE_HOLE_10, reverseEdges }], plane));
    actual.sketch.entities.reverse(); const before = JSON.stringify(actual.sketch), catalog = buildSketchRegions(actual.sketch), region = selectSketchRegion(catalog);
    assert.equal(JSON.stringify(actual.sketch), before); assert.equal(catalog.loops.length, 2); assert.equal(region.areaMm2, 1100);
    assert.equal(polygonArea(region.outer.points), 1200); assert.equal(polygonArea(region.holes[0].points), -100);
    assert.deepEqual(new Set(region.definition.outerEntityIds), new Set(['outer-e0', 'outer-e1', 'outer-e2', 'outer-e3']));
    assert.deepEqual(resolveSketchRegion(actual.sketch, region.definition).definition, region.definition);
    cases.push({ plane, reversedEdges: reverseEdges, input: actual.sketch, native: actual.native, region, passed: true });
  }
  evidence.push({ id: 'rectangle-hole-three-planes', cases });
});
test('real circles, both semicircle directions, co-circular halves and a two-arc lens form simple closed regions', () => {
  const cases = [];
  for (const plane of ['XY', 'XZ', 'YZ']) for (const shape of [circle('circle', [0, 0], 10),
    { kind: 'semicircle', id: 'half', center: [0, 0], radius: 10, clockwise: false },
    { kind: 'semicircle', id: 'half', center: [0, 0], radius: 10, clockwise: true },
    { kind: 'split-circle', id: 'split', center: [0, 0], radius: 10, clockwise: false },
    { kind: 'split-circle', id: 'split', center: [0, 0], radius: 10, clockwise: true },
    { kind: 'lens', id: 'lens' }]) {
    const actual = solve(contourFixture(`${plane}-${shape.kind}-${shape.clockwise}`, [shape], plane));
    const region = selectSketchRegion(buildSketchRegions(actual.sketch));
    const expected = shape.kind === 'semicircle' ? 50 * Math.PI : shape.kind === 'lens' ? 50 * Math.acos(0.6) - 24 : 100 * Math.PI;
    assert(Math.abs(region.areaMm2 - expected) < 1e-10); assert(polygonArea(region.outer.points) > 0);
    const relativeAreaError = Math.abs(polygonArea(region.outer.points) - expected) / expected; assert(relativeAreaError <= 0.01);
    cases.push({ plane, shape, native: actual.native, source: actual.sketch, expectedAreaMm2: expected, actualAnalyticAreaMm2: region.areaMm2,
      independentPolygonAreaMm2: polygonArea(region.outer.points), relativeAreaError, passed: true });
  }
  evidence.push({ id: 'mixed-curve-regions', cases });
});
test('holes and nested islands use containment parity; multiple material regions require an explicit selection', () => {
  const actual = solve(contourFixture('nested', [circle('outer', [0, 0], 10), circle('hole', [0, 0], 6), circle('island', [0, 0], 2)]));
  const catalog = buildSketchRegions(actual.sketch); assert.equal(catalog.regions.length, 2); assert.deepEqual(catalog.loops.map(l => l.depth).sort(), [0, 1, 2]);
  assert.throws(() => selectSketchRegion(catalog), e => e.code === 'REGION_SELECTION_REQUIRED');
  const shell = selectSketchRegion(catalog, ['outer']), island = selectSketchRegion(catalog, ['island']);
  assert(Math.abs(shell.areaMm2 - 64 * Math.PI) < 1e-10); assert(Math.abs(island.areaMm2 - 4 * Math.PI) < 1e-10);
  const separate = solve(contourFixture('separate', [outer, { kind: 'polygon', id: 'other', points: RECTANGLE_HOLE_10.map(p => [p[0] + 50, p[1]]) }]));
  const multi = buildSketchRegions(separate.sketch); assert.equal(multi.regions.length, 2);
  assert.throws(() => selectSketchRegion(multi), e => e.code === 'REGION_SELECTION_REQUIRED');
  const selected = selectSketchRegion(multi, ['outer-e3', 'outer-e1', 'outer-e0', 'outer-e2']); assert.equal(selected.areaMm2, 1200);
  assert.throws(() => selectSketchRegion(multi, ['outer-e0']), e => e.code === 'REGION_MISSING');
  assert.throws(() => resolveSketchRegion(actual.sketch, { outerEntityIds: ['outer'], holeEntityIds: [] }), e => e.code === 'REGION_HOLES_CHANGED');
  evidence.push({ id: 'selection-and-parity', native: actual.native, input: actual.sketch, catalog, shellAreaMm2: shell.areaMm2, islandAreaMm2: island.areaMm2,
    separateInput: separate.sketch, selectedDefinition: selected.definition, refusesGuessAndMissingHole: true });
});
test('open, branched, bow-tie, duplicate/retraced lines and overlapping arcs fail with concrete diagnostics', () => {
  const cases = [];
  const run = (input, code) => { const actual = solve(input); reject(actual.sketch, code); cases.push({ input: actual.sketch, native: actual.native, actualCode: code, passed: true }); };
  const open = contourFixture('open', [outer]); open.entities.pop(); run(open, 'CONTOUR_OPEN');
  const branch = contourFixture('branch', [outer]); branch.entities.push({ id: 'diagonal', kind: 'line', startPointId: 'outer-p0', endPointId: 'outer-p2' }); run(branch, 'CONTOUR_BRANCH');
  run(contourFixture('bow-tie', [{ kind: 'polygon', id: 'bow', points: [[0, 0], [10, 10], [0, 10], [10, 0]] }]), 'CONTOUR_CONTACT');
  run(contourFixture('retraced', [{ kind: 'polygon', id: 'back', points: [[0, 0], [10, 0], [5, 0], [5, 10], [0, 10]] }]), 'CONTOUR_OVERLAP');
  const duplicate = contourFixture('duplicate', [outer]); duplicate.entities.push({ ...duplicate.entities[0], id: 'copy' }); run(duplicate, 'CONTOUR_BRANCH');
  const overlapping = contourFixture('overlap-arcs', [{ kind: 'split-circle', id: 'split', center: [0, 0], radius: 10 }]); overlapping.entities[1].clockwise = true; run(overlapping, 'CONTOUR_OVERLAP');
  evidence.push({ id: 'invalid-topology', cases });
});
test('analytic circle/arc/line contacts reject tangent or intersecting holes even between sampling vertices', () => {
  const cases = [], theta = 2.5 * Math.PI / 180;
  const run = (id, shapes, code = 'CONTOUR_CONTACT') => { const actual = solve(contourFixture(id, shapes)); reject(actual.sketch, code); cases.push({ input: actual.sketch, native: actual.native, actualCode: code, passed: true }); return actual; };
  for (const d of [4, 3.9999, 4 + 5e-7]) {
    const actual = run(`holes-circle-${d}`, [outer, circle('a', [12, 15], 2), circle('b', [12 + d * Math.cos(theta), 15 + d * Math.sin(theta)], 2)]);
    const gap = independentPolylineGap(sampleSketchEntity(actual.sketch, 'a').points, sampleSketchEntity(actual.sketch, 'b').points);
    assert(gap > 0.001); cases.at(-1).independentSampledBoundaryGapMm = gap;
  }
  run('hole-outer-line-tangent', [outer, circle('hole', [10, 5], 5)]);
  run('hole-outer-circle-tangent', [circle('outer', [0, 0], 10), circle('hole', [8 * Math.cos(theta), 8 * Math.sin(theta)], 2)]);
  run('hole-overlap-lines', [outer, { kind: 'polygon', id: 'h1', points: RECTANGLE_HOLE_10 }, { kind: 'polygon', id: 'h2', points: RECTANGLE_HOLE_10.map(p => [p[0] + 5, p[1]]) }], 'CONTOUR_OVERLAP');
  run('arc-hole-contact', [{ kind: 'semicircle', id: 'outer', center: [0, 0], radius: 10, clockwise: true }, circle('hole', [0, 8], 2)]);
  run('arc-arc-hole-contact', [{ kind: 'split-circle', id: 'outer', center: [0, 0], radius: 10 }, { kind: 'split-circle', id: 'hole', center: [8 * Math.cos(theta), 8 * Math.sin(theta)], radius: 2 }]);
  evidence.push({ id: 'analytic-contact-refusals', samplingAngleOffsetDegrees: 2.5, cases });
});
test('near endpoints close only within 1e-6mm; transitive chains wider than tolerance are refused', () => {
  const near = contourFixture('near-closed', [{ ...outer, separateEndpoints: true }]);
  near.points.find(p => p.id === 'outer-e1-a').position[0] += 5e-7;
  const solved = solveDomainSketch(module, { sketch: { ...near, constraints: [] } }); assert(solved.sketch);
  const catalog = buildSketchRegions(solved.sketch); assert.equal(catalog.regions.length, 1); assert(Math.abs(catalog.regions[0].areaMm2 - 1200) <= 1e-4);
  const far = structuredClone(solved.sketch); far.points.find(p => p.id === 'outer-e1-a').position[0] += 2e-6; reject(far, 'CONTOUR_OPEN');
  const chain = contourFixture('transitive', [{ ...outer, separateEndpoints: true }]);
  chain.points.find(p => p.id === 'outer-e0-b').position = [40, 0]; chain.points.find(p => p.id === 'outer-e1-a').position = [40 + 0.75e-6, 0];
  chain.points.push({ id: 'extra-end', position: [40 + 1.5e-6, 0] }, { id: 'far', position: [50, -10] });
  chain.entities.push({ id: 'extra-edge', kind: 'line', startPointId: 'extra-end', endPointId: 'far' });
  reject(chain, 'CONTOUR_AMBIGUOUS_ENDPOINT');
  evidence.push({ id: 'closure-tolerance', input: solved.sketch, actualNativeDof: solved.dof, maximumAcceptedOffsetMm: 5e-7, catalog,
    fartherOffsetCode: 'CONTOUR_OPEN', transitiveInput: chain, transitiveCode: 'CONTOUR_AMBIGUOUS_ENDPOINT' });
});
test('analytic and polygon classifications disagree for a tiny near-boundary hole; default precision refuses, tighter precision succeeds', () => {
  const theta = 2.5 * Math.PI / 180, d = 9.995;
  const actual = solve(contourFixture('precision-hole', [circle('outer', [0, 0], 10), circle('tiny-hole', [d * Math.cos(theta), d * Math.sin(theta)], 0.001)]));
  reject(actual.sketch, 'CONTOUR_PRECISION_COLLISION');
  const catalog = buildSketchRegions(actual.sketch, { chordErrorMm: 1e-4 }); assert.equal(catalog.regions.length, 1); assert.equal(catalog.regions[0].holes.length, 1);
  evidence.push({ id: 'precision-classification', input: actual.sketch, native: actual.native, defaultCode: 'CONTOUR_PRECISION_COLLISION', tighterChordErrorMm: 1e-4,
    actualHoleCount: catalog.regions[0].holes.length, areaMm2: catalog.regions[0].areaMm2 });
});
test('finite contact and analytic containment distinguish support-circle intersections outside an arc and co-circular halves', () => {
  const input = contourFixture('arc-check', [{ kind: 'semicircle', id: 'half', center: [0, 0], radius: 10, clockwise: true }]);
  const solved = solve(input), arc = boundaryCurve(solved.sketch, solved.sketch.entities[0]);
  const outside = { id: 'outside', kind: 'line', a: [-20, -5], b: [20, -5] }, across = { id: 'inside', kind: 'line', a: [-20, 5], b: [20, 5] };
  assert.equal(curveContacts(arc, outside).points.length, 0); assert.equal(curveContacts(arc, across).points.length, 2);
  const primitives = solved.sketch.entities.map(e => boundaryCurve(solved.sketch, e));
  for (const [p, expected] of [[[0, 5], true], [[0, -5], false], [[9, 9], false], [[-5, 1], true]]) assert.equal(insideAnalyticLoop(p, primitives), expected);
  evidence.push({ id: 'finite-arc-and-containment', source: solved.sketch, outsideContacts: 0, insideContacts: curveContacts(arc, across).points,
    pointChecks: [{ point: [0, 5], inside: true }, { point: [0, -5], inside: false }, { point: [9, 9], inside: false }, { point: [-5, 1], inside: true }] });
});
test('analytic ray classification agrees with independent disk/half-disk/lens membership on a grid', () => {
  const cases = [];
  for (const shape of [circle('disk', [0, 0], 10), { kind: 'semicircle', id: 'half', center: [0, 0], radius: 10, clockwise: true },
    { kind: 'semicircle', id: 'half', center: [0, 0], radius: 10, clockwise: false }, { kind: 'lens', id: 'lens' }]) {
    const actual = solve(contourFixture(`grid-${shape.kind}-${shape.clockwise}`, [shape]));
    const curves = actual.sketch.entities.map(e => boundaryCurve(actual.sketch, e)), probes = [];
    for (let x = -12; x <= 12; x += 3) for (let y = -12; y <= 12; y += 3) {
      const p = [x + 0.37, y + 0.41], expected = shape.kind === 'lens' ? Math.hypot(p[0] + 3, p[1]) < 5 && Math.hypot(p[0] - 3, p[1]) < 5
        : Math.hypot(...p) < 10 && (shape.kind === 'circle' || (shape.clockwise ? p[1] > 0 : p[1] < 0));
      assert.equal(insideAnalyticLoop(p, curves), expected, `${actual.sketch.id} ${p}`); probes.push({ p, expectedInside: expected, actualInside: expected });
    }
    cases.push({ input: actual.sketch, native: actual.native, probes });
  }
  evidence.push({ id: 'independent-analytic-grid', probeCount: cases.reduce((n, c) => n + c.probes.length, 0), cases });
});
test('concave containment at large translated doubles separates a hole from an unrelated region inside the same bounding box', () => {
  const move = points => points.map(p => [p[0] + 9000.123456789, p[1] - 9000.987654321]);
  const input = contourFixture('concave-translated', [{ kind: 'polygon', id: 'concave', points: move([[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]]) },
    { kind: 'polygon', id: 'hole', points: move([[2, 12], [8, 12], [8, 18], [2, 18]]) }, circle('other', move([[25, 20]])[0], 2)]);
  const actual = solve(input), catalog = buildSketchRegions(actual.sketch); assert.equal(catalog.regions.length, 2);
  const concave = selectSketchRegion(catalog, Array.from({ length: 6 }, (_, i) => `concave-e${i}`)); assert.equal(concave.holes.length, 1);
  assert(Math.abs(concave.areaMm2 - 564) < 1e-8); assert(Math.abs(selectSketchRegion(catalog, ['other']).areaMm2 - 4 * Math.PI) < 1e-8);
  evidence.push({ id: 'concave-translated', source: actual.sketch, native: actual.native, expectedAreaMm2: 564, actualAreaMm2: concave.areaMm2,
    regionCount: catalog.regions.length, holeCount: concave.holes.length });
});
after(() => {
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync('docs/learning/evidence/T-202B-regions.json', JSON.stringify({ task: 'T-202B', executedAt: new Date().toISOString(), command: 'npm run check:regions',
    environment: { node: process.version, platform: process.platform, solver: 'unchanged SolveSpace 2879a02d WASM' }, tests: 10, evidence, nativeErrors: errors, passed: evidence.length === 10,
    limitations: ['Core region discovery/selection only; extrusion, preview/commit UI and complete REQ-006 remain T-202C.', 'All sketch entities participate; there is no construction-geometry mode.', 'Default tessellation can explicitly refuse narrow valid regions; tighter precision is available to the core caller.'] }, null, 2) + '\n');
});
