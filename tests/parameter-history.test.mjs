import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { featureRecompute } from '../src/app/feature-recompute.ts';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { serializeProject, validateDocument } from '../src/core/model/validate-document.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { BASE_PLANES } from '../src/core/geometry/plane.ts';
import { domainRectangle, domainCircle } from '../src/experiments/domain-solver-fixtures.ts';
const nativeErrors = [], module = await createModule({ printErr: e => nativeErrors.push(e) }), evidence = [];
const pipeline = featureRecompute(async input => solveDomainSketch(module, input), async input => runSolid(input));
const authority = engine => ({ document: engine.document, cache: engine.cache, diagnostics: engine.diagnostics });
const snapshot = engine => ({ ...authority(engine), revision: engine.revision, historyLength: engine.historyLength, canRedo: engine.canRedo, dirty: engine.dirty, saveBytes: serializeProject(engine.captureSave().document) });
const checkVolume = (mesh, expected, curve = false) => {
  const metrics = meshMetrics(mesh); assert(metrics.closed && metrics.signedVolume > 0 && metrics.windingErrors === 0);
  assert(Math.abs(metrics.signedVolume - expected) <= (curve ? expected * 0.01 : 1e-6)); return metrics;
};
function holeSketch() {
  const sketch = domainRectangle();
  sketch.points.push(...[[15, 10], [25, 10], [25, 20], [15, 20]].map((position, i) => ({ id: `hole-p${i}`, position })));
  sketch.entities.push(...[0, 1, 2, 3].map(i => ({ id: `hole-e${i}`, kind: 'line', startPointId: `hole-p${i}`, endPointId: `hole-p${(i + 1) % 4}` })));
  sketch.constraints.push({ id: 'hole-fixed', kind: 'fixed', refs: [{ pointId: 'hole-p0' }], fixedPosition: [15, 10] },
    ...[0, 1, 2, 3].map(i => ({ id: `hole-direction${i}`, kind: i % 2 ? 'vertical' : 'horizontal', refs: [{ entityId: `hole-e${i}` }] })),
    { id: 'hole-width', kind: 'length', refs: [{ entityId: 'hole-e0' }], value: 10 },
    { id: 'hole-height', kind: 'length', refs: [{ entityId: 'hole-e1' }], value: 10 }); return sketch;
}
function halfSketch() {
  return { id: 'half', kind: 'sketch', name: '半圆', visible: true, plane: structuredClone(BASE_PLANES.XY),
    points: [{ id: 'center', position: [0, 0] }, { id: 'start', position: [-10, 0] }, { id: 'end', position: [10, 0] }],
    entities: [{ id: 'arc', kind: 'arc', centerPointId: 'center', startPointId: 'start', endPointId: 'end', clockwise: true },
      { id: 'diameter', kind: 'line', startPointId: 'end', endPointId: 'start' }],
    constraints: [{ id: 'center-fixed', kind: 'fixed', refs: [{ pointId: 'center' }], fixedPosition: [0, 0] },
      { id: 'start-fixed', kind: 'fixed', refs: [{ pointId: 'start' }], fixedPosition: [-10, 0] },
      { id: 'diameter-horizontal', kind: 'horizontal', refs: [{ entityId: 'diameter' }] }] };
}
async function setup(sketch, depth = 10, recompute = pipeline) {
  const engine = new ProjectEngine(createEmptyProject(), { recompute }); await engine.execute({ kind: 'add-feature', feature: sketch });
  const solved = engine.document.features[0], extrude = { id: 'extrude', kind: 'extrude', name: '拉伸', visible: true, sketchId: solved.id, region: selectSketchRegion(buildSketchRegions(solved)).definition, depth };
  await engine.execute({ kind: 'add-feature', feature: extrude }); return { engine, extrude };
}
async function changeConstraint(engine, id, update) {
  const feature = engine.document.features[0]; Object.assign(feature.constraints.find(c => c.id === id), update); await engine.execute({ kind: 'replace-feature', feature });
}
function exactHistory(engine, before, after) {
  assert(engine.undo()); assert.deepEqual(authority(engine), before); assert(engine.redo()); assert.deepEqual(authority(engine), after);
}
test('three-plane signed extrusions follow 40→60 width with stable source IDs and exact geometry/constraint history', async () => {
  const cases = [];
  for (const plane of ['XY', 'XZ', 'YZ']) for (const depth of [10, -10]) {
    const sketch = domainRectangle(); sketch.plane = structuredClone(BASE_PLANES[plane]); const { engine, extrude } = await setup(sketch, depth), before = authority(engine);
    const first = checkVolume(engine.cache.extrude, 12000); await changeConstraint(engine, 'width', { value: 60 }); const changed = authority(engine), actual = checkVolume(engine.cache.extrude, 18000);
    assert.deepEqual(engine.document.features[1], extrude); exactHistory(engine, before, changed);
    const saved = JSON.parse(serializeProject(engine.document)); assert.deepEqual(validateDocument(saved), saved); assert.deepEqual(saved.features[1], extrude); assert(!('cache' in saved));
    cases.push({ plane, depth, sourceDefinition: extrude, first, actual, diagnostics: changed.diagnostics, exactDocumentCacheDiagnosticsUndoRedo: true });
  } evidence.push({ id: 'rectangle-signed-history', cases, toleranceMm: 1e-5, volumeToleranceMm3: 1e-6 });
});
test('hole dimensions recompute material subtraction; downstream contact/removal failures retain the exact valid source and history', async () => {
  const cases = [];
  for (const plane of ['XY', 'XZ', 'YZ']) {
    const sketch = holeSketch(); sketch.plane = structuredClone(BASE_PLANES[plane]); const { engine, extrude } = await setup(sketch), before = authority(engine), first = checkVolume(engine.cache.extrude, 11000);
    await changeConstraint(engine, 'width', { value: 60 }); const wider = authority(engine), outerChanged = checkVolume(engine.cache.extrude, 17000);
    await changeConstraint(engine, 'hole-width', { value: 20 }); const holeChanged = authority(engine), actual = checkVolume(engine.cache.extrude, 16000);
    assert.deepEqual(engine.document.features[1], extrude); exactHistory(engine, wider, holeChanged); engine.undo(); engine.undo(); assert.deepEqual(authority(engine), before); engine.redo(); engine.redo(); assert.deepEqual(authority(engine), holeChanged);
    const held = snapshot(engine), failures = [];
    // Length is unsigned: make either possible direction cross the outer ring.
    const touching = engine.document.features[0]; touching.constraints.find(c => c.id === 'hole-width').value = 60;
    const omitted = engine.document.features[0]; omitted.points = omitted.points.filter(p => !p.id.startsWith('hole-')); omitted.entities = omitted.entities.filter(e => !e.id.startsWith('hole-')); omitted.constraints = omitted.constraints.filter(c => !c.id.startsWith('hole-'));
    for (const [feature, code] of [[touching, 'CONTOUR_CONTACT'], [omitted, 'REFERENCE_MISSING']]) {
      await assert.rejects(engine.execute({ kind: 'replace-feature', feature }), e => { failures.push({ expectedCode: code, actualCode: e.code, message: e.message }); return e.code === code; }); assert.deepEqual(snapshot(engine), held);
    }
    cases.push({ plane, volumes: [first, outerChanged, actual], sourceDefinition: extrude, failures, exactRollback: true, exactUndoRedo: true });
  } evidence.push({ id: 'hole-parameter-history', cases, volumeToleranceMm3: 1e-6 });
});
test('circle radius and intrinsic semicircle radius edits regenerate closed signed solids with exact history', async () => {
  const cases = [];
  for (const kind of ['circle', 'half']) for (const plane of ['XY', 'XZ', 'YZ']) for (const depth of [10, -10]) {
    const sketch = kind === 'circle' ? domainCircle() : halfSketch(); sketch.plane = structuredClone(BASE_PLANES[plane]); const { engine, extrude } = await setup(sketch, depth), before = authority(engine), factor = kind === 'circle' ? 1 : 0.5;
    const first = checkVolume(engine.cache.extrude, factor * 1000 * Math.PI, true);
    await changeConstraint(engine, kind === 'circle' ? 'circle-radius' : 'start-fixed', kind === 'circle' ? { value: 12 } : { fixedPosition: [-12, 0] });
    const changed = authority(engine), expected = factor * 1440 * Math.PI, actual = checkVolume(engine.cache.extrude, expected, true); assert.deepEqual(engine.document.features[1], extrude); exactHistory(engine, before, changed);
    cases.push({ kind, plane, depth, expectedVolumeMm3: expected, first, actual, sourceDefinition: extrude, source: changed.document.features[0], diagnostics: changed.diagnostics, exactUndoRedo: true });
  } evidence.push({ id: 'curve-parameter-history', cases, relativeVolumeTolerance: 0.01 });
});
test('a later real extrusion failure discards an already-computed earlier mesh and preserves redo and save snapshot', async () => {
  const calls = [], recompute = featureRecompute(async input => solveDomainSketch(module, input), async input => {
    try { const mesh = runSolid(input); calls.push({ depth: input.depth, origin: input.sketch.plane.origin, actual: meshMetrics(mesh) }); return mesh; }
    catch (e) { calls.push({ depth: input.depth, origin: input.sketch.plane.origin, failure: e.code }); throw e; }
  });
  const { engine, extrude } = await setup(domainRectangle(), 10, recompute); await engine.execute({ kind: 'add-feature', feature: { ...extrude, id: 'deep', name: '深拉伸', depth: 10000 } });
  engine.markSaved(engine.captureSave()); const saved = authority(engine);
  await engine.execute({ kind: 'rename-project', name: '重做分支' }); const named = authority(engine); engine.undo(); assert.deepEqual(authority(engine), saved); assert(engine.canRedo && !engine.dirty);
  const before = snapshot(engine), source = engine.document.features[0]; source.plane.origin[2] = 1; const firstCall = calls.length;
  await assert.rejects(engine.execute({ kind: 'replace-feature', feature: source }), e => e.code === 'EXTRUSION_WORKSPACE_RANGE');
  const attempted = calls.slice(firstCall); assert.equal(attempted.length, 2); assert.equal(attempted[0].actual.signedVolume, 12000); assert.deepEqual(attempted[0].actual.bounds, { min: [0, 0, 1], max: [40, 30, 11] }); assert.equal(attempted[1].failure, 'EXTRUSION_WORKSPACE_RANGE');
  assert.deepEqual(snapshot(engine), before); assert(engine.redo()); assert.deepEqual(authority(engine), named); assert(engine.dirty); engine.undo(); assert(!engine.dirty);
  evidence.push({ id: 'late-descendant-atomic-failure', attempted, oneEarlierMeshActuallyComputed: true, oldDocumentCacheDiagnosticsRevisionHistorySaveBytesUnchanged: true, redoBranchPreserved: true, dirtyRestoredToSaveSnapshot: true });
});
after(() => {
  assert.equal(nativeErrors.length, 0, nativeErrors.join('\n'));
  writeFileSync('docs/learning/evidence/T-203-parameter-history.json', JSON.stringify({ task: 'T-203', executedAt: new Date().toISOString(), command: 'npm run check:parameters', environment: { node: process.version, platform: process.platform, three: '0.186.1', solver: 'SolveSpace 2879a02d unchanged WASM' }, tests: 4, evidence, nativeErrors, passed: evidence.length === 4,
    limitations: ['Sketch/extrude full recomputation only; Boolean and affected-branch optimization remain later.', 'Save snapshot/JSON bytes tested; file UI is not implemented.'] }, null, 2) + '\n');
});
