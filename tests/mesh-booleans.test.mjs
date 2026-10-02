import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { featureRecompute } from '../src/app/feature-recompute.ts';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { serializeProject } from '../src/core/model/validate-document.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { booleanBoxSketch, runMeshBooleanFixtures } from '../src/experiments/mesh-boolean-fixtures.ts';
const nativeErrors = [], module = await createModule({ printErr: e => nativeErrors.push(e) }), evidence = [];
const solve = async input => solveDomainSketch(module, input), run = async input => runSolid(input), pipeline = featureRecompute(solve, run);
const authority = engine => ({ document: engine.document, cache: engine.cache, diagnostics: engine.diagnostics });
const snapshot = engine => ({ ...authority(engine), revision: engine.revision, history: engine.historyLength, saveBytes: serializeProject(engine.captureSave().document), canRedo: engine.canRedo });
const feature = (id, operation = 'union', a = 'solid-a', b = 'solid-b') => ({ id, kind: 'boolean', name: id, visible: true, operation, operandAId: a, operandBId: b });
async function setup(x = 10, y = 0, recompute = pipeline) {
  const engine = new ProjectEngine(createEmptyProject(), { recompute });
  for (const id of ['a', 'b']) {
    await engine.execute({ kind: 'add-feature', feature: booleanBoxSketch(id, 'XY', id === 'b' ? x : 0, id === 'b' ? y : 0) });
    const sketch = engine.document.features.find(f => f.id === id);
    await engine.execute({ kind: 'add-feature', feature: { id: `solid-${id}`, kind: 'extrude', name: `solid-${id}`, visible: true, sketchId: id, region: selectSketchRegion(buildSketchRegions(sketch)).definition, depth: 20 } });
  } return engine;
}
test('actual solved extrusion operands: 23 mesh Boolean cases, eight refusals and recovery', async () => {
  const actual = await runMeshBooleanFixtures(solve, run); assert.equal(actual.cases.length, 23); assert.equal(actual.invalid.length, 8); assert(actual.recoveredAfterErrors); evidence.push({ id: 'mesh-fixtures', ...actual });
});
test('Boolean add hides inputs in one atomic history entry; stable DAG recomputes actual downstream meshes', async () => {
  const engine = await setup(), before = authority(engine), history = engine.historyLength, rev = engine.revision;
  await engine.execute({ kind: 'add-feature', feature: feature('union') }); const joined = authority(engine);
  assert(Math.abs(meshMetrics(engine.cache.union).signedVolume - 12000) < 1e-6); assert.equal(engine.historyLength, history + 1); assert.equal(engine.revision, rev + 1);
  assert(engine.document.features.filter(f => ['solid-a', 'solid-b'].includes(f.id)).every(f => !f.visible));
  engine.undo(); assert.deepEqual(authority(engine), before); engine.redo(); assert.deepEqual(authority(engine), joined);
  await engine.execute({ kind: 'add-feature', feature: feature('subtract', 'subtract') }); await engine.execute({ kind: 'add-feature', feature: feature('intersect', 'intersect') });
  const held = authority(engine), source = engine.document.features.find(f => f.id === 'a');
  for (const c of source.constraints) if (['a-outer-p1', 'a-outer-p2'].includes(c.refs[0].pointId)) c.fixedPosition[0] = 25;
  await engine.execute({ kind: 'replace-feature', feature: source }); const changed = authority(engine), volumes = ['union', 'subtract', 'intersect'].map(id => meshMetrics(engine.cache[id]).signedVolume);
  volumes.forEach((v, i) => assert(Math.abs(v - [12000, 4000, 6000][i]) < 1e-6));
  assert.deepEqual(changed.document.features.filter(f => f.kind !== 'sketch'), held.document.features.filter(f => f.kind !== 'sketch'));
  engine.undo(); assert.deepEqual(authority(engine), held); engine.redo(); assert.deepEqual(authority(engine), changed);
  const saved = JSON.parse(serializeProject(engine.document)); assert(!('cache' in saved)); assert(saved.features.filter(f => ['solid-a', 'solid-b'].includes(f.id)).every(f => !f.visible));
  evidence.push({ id: 'atomic-hidden-inputs-and-dag', oneHistoryEntry: true, exactVisibilityDocumentCacheDiagnosticsHistory: true, widthsMm: [20, 25], actualVolumesMm3: volumes, sourceDefinitions: saved.features.filter(f => f.kind === 'boolean') });
});
test('empty is a real cached result; refuses reuse, then recomputes when source moves without changing IDs', async () => {
  const engine = await setup(30); await engine.execute({ kind: 'add-feature', feature: feature('empty', 'intersect') }); const empty = authority(engine), before = snapshot(engine), measured = meshMetrics(engine.cache.empty);
  assert.deepEqual(engine.cache.empty, { positions: [] }); assert.equal(measured.bounds, null); assert.equal(measured.signedVolume, 0);
  await assert.rejects(engine.execute({ kind: 'add-feature', feature: feature('invalid', 'union', 'empty', 'solid-a') }), e => e.code === 'BOOLEAN_EMPTY_OPERAND'); assert.deepEqual(snapshot(engine), before);
  const source = engine.document.features.find(f => f.id === 'b'); for (const c of source.constraints) c.fixedPosition[0] -= 20;
  await engine.execute({ kind: 'replace-feature', feature: source }); const actual = meshMetrics(engine.cache.empty), changed = authority(engine); assert(actual.closed); assert(Math.abs(actual.signedVolume - 4000) < 1e-6);
  assert.deepEqual(changed.document.features.at(-1), empty.document.features.at(-1)); engine.undo(); assert.deepEqual(authority(engine), empty); engine.redo(); assert.deepEqual(authority(engine), changed);
  evidence.push({ id: 'explicit-empty-history', initial: measured, invalidOperandRollbackExact: true, laterRealResult: actual, stableFeatureId: 'empty', exactUndoRedo: true });
});
test('failed non-manifold Boolean does not hide source inputs, reuse last geometry or enter history; retry works', async () => {
  const engine = await setup(20, 20), before = snapshot(engine);
  await assert.rejects(engine.execute({ kind: 'add-feature', feature: feature('bad') }), e => e.code === 'BOOLEAN_INVALID_RESULT'); assert.deepEqual(snapshot(engine), before); assert(engine.document.features.filter(f => f.kind === 'extrude').every(f => f.visible));
  await engine.execute({ kind: 'add-feature', feature: feature('recovered', 'subtract') }); const actual = meshMetrics(engine.cache.recovered); assert(actual.closed); assert(Math.abs(actual.signedVolume - 8000) < 1e-6);
  evidence.push({ id: 'non-manifold-rollback-recovery', code: 'BOOLEAN_INVALID_RESULT', exactOldAuthorityHistorySaveBytes: true, failureInputsStillVisible: true, actualRecovery: actual });
});
test('a late actual Boolean mesh after cancellation cannot hide inputs or enter the current document', async () => {
  let release, entered; const started = new Promise(resolve => entered = resolve);
  const delayed = featureRecompute(solve, async input => { const actual = runSolid(input); if (input.kind === 'mesh-boolean') { entered(); await new Promise(resolve => release = resolve); } return actual; });
  const engine = await setup(10, 0, delayed), before = snapshot(engine); const pending = engine.execute({ kind: 'add-feature', feature: feature('cancelled') }), rejected = assert.rejects(pending, e => e.code === 'STALE_TRANSACTION');
  await started; assert.throws(() => engine.undo(), e => e.code === 'TRANSACTION_BUSY'); engine.cancelPending(); release(); await rejected; assert.deepEqual(snapshot(engine), before);
  evidence.push({ id: 'late-actual-Boolean', actualMeshComputedBeforeDelay: true, undoWhileBusyRefused: true, lateMeshDiscarded: true, inputVisibilityDocumentCacheDiagnosticsHistoryExact: true });
});
after(() => {
  assert.equal(nativeErrors.length, 0, nativeErrors.join('\n'));
  writeFileSync('docs/learning/evidence/T-301A-mesh-booleans.json', JSON.stringify({ task: 'T-301A', executedAt: new Date().toISOString(), command: 'npm run check:mesh-booleans', environment: { node: process.version, platform: process.platform, three: '0.186.1', csg: 'unchanged THREE-CSGMesh 8bd00fe9', solver: 'unchanged SolveSpace 2879a02d WASM' }, tests: 5, evidence, nativeErrors, passed: evidence.length === 5,
    limitations: ['Workspace A/B controls and full REQ-007 UI acceptance remain T-301B.', 'Full DAG recomputation; branch optimization remains T-302.', '2000 input triangles per operand, 2000 unique output vertices conformity cap.'] }, null, 2) + '\n');
});
