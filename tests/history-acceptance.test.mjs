import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { featureRecompute } from '../src/app/feature-recompute.ts';
import { SketchDrag } from '../src/app/sketch-drag.ts';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { serializeProject } from '../src/core/model/validate-document.ts';
import { BASE_PLANES } from '../src/core/geometry/plane.ts';
import { drawingFeature } from '../src/core/geometry/drawing.ts';
import { addSketchConstraint, editSketchConstraint, removeSketchConstraint } from '../src/core/geometry/constraint-edit.ts';
import { deleteSketchEntities } from '../src/core/geometry/sketch-edit.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { booleanBoxSketch } from '../src/experiments/mesh-boolean-fixtures.ts';

const nativeErrors = [], module = await createModule({ printErr: e => nativeErrors.push(e) }), evidence = [];
const authority = engine => ({ document: engine.document, cache: engine.cache, diagnostics: engine.diagnostics });
const state = engine => ({ ...authority(engine), revision: engine.revision, history: engine.historyLength, dirty: engine.dirty, canRedo: engine.canRedo, bytes: serializeProject(engine.captureSave().document) });
const code = expected => e => e.code === expected;
const volumes = engine => Object.fromEntries(Object.entries(engine.cache).map(([id, mesh]) => [id, meshMetrics(mesh).signedVolume]));
function volume(engine, id, expected) {
  const actual = meshMetrics(engine.cache[id]); assert(actual.closed && actual.windingErrors === 0);
  assert(Math.abs(actual.signedVolume - expected) <= 1e-6, `${id}: ${actual.signedVolume} != ${expected}`); return actual.signedVolume;
}
function setup() {
  const calls = [], recompute = featureRecompute(async input => { calls.push({ kind: 'solve', id: input.sketch.id }); return solveDomainSketch(module, input); }, async input => {
    calls.push({ kind: input.kind, id: input.sketch?.id, operation: input.operation }); return runSolid(input);
  });
  let gate;
  const engine = new ProjectEngine(createEmptyProject(), { recompute: async (candidate, context) => {
    const result = await recompute(candidate, context);
    if (gate) await gate(result); return result;
  } });
  return { engine, calls, hold: callback => { gate = callback; } };
}
const source = (engine, id) => engine.document.features.find(f => f.id === id);
async function extrude(engine, id, sketchId, depth = 20) {
  return engine.execute({ kind: 'add-feature', feature: { id, kind: 'extrude', name: id, visible: true, sketchId, region: selectSketchRegion(buildSketchRegions(source(engine, sketchId))).definition, depth } });
}
async function boxes() {
  const fixture = setup(), { engine } = fixture;
  for (const [id, x] of [['a', 0], ['b', 10]]) { await engine.execute({ kind: 'add-feature', feature: booleanBoxSketch(id, 'XY', x) }); await extrude(engine, `solid-${id}`, id); }
  await engine.execute({ kind: 'add-feature', feature: { id: 'join', kind: 'boolean', name: '交集', visible: true, operation: 'intersect', operandAId: 'solid-a', operandBId: 'solid-b' } });
  return fixture;
}

test('all user operation families restore exact solved documents, native diagnostics and actual meshes without rerunning kernels', async () => {
  const { engine, calls } = setup(), operations = []; let nextId = 0;
  const id = () => `draw-${++nextId}`;
  async function command(label, input) {
    const before = authority(engine), length = engine.historyLength, revision = engine.revision;
    assert(await engine.execute(input)); const after = authority(engine), callCount = calls.length;
    assert.equal(engine.historyLength, length + 1); assert.equal(engine.revision, revision + 1);
    assert(engine.undo()); assert.deepEqual(authority(engine), before); assert(engine.redo()); assert.deepEqual(authority(engine), after);
    assert.equal(calls.length, callCount, 'undo/redo must restore stored geometry, not solve again');
    operations.push({ label, kind: input.kind, exactUndoRedo: true, actualVolumesMm3: volumes(engine), dof: Object.fromEntries(Object.entries(engine.diagnostics).map(([key, d]) => [key, d.dof])) });
  }
  const replace = (label, feature) => command(label, { kind: 'replace-feature', feature });
  await command('new-sketch', { kind: 'add-feature', feature: { id: 'draw', kind: 'sketch', name: '绘制', visible: true, plane: BASE_PLANES.XY, points: [], entities: [], constraints: [] } });
  await replace('draw-line', drawingFeature(source(engine, 'draw'), 'line', [{ position: [0, 50] }, { position: [20, 50] }], id).feature);
  let sketch = source(engine, 'draw'), line = sketch.entities[0];
  await replace('add-horizontal', addSketchConstraint(sketch, 'horizontal', [line.id], undefined, id()));
  await replace('add-fixed', addSketchConstraint(source(engine, 'draw'), 'fixed', [line.startPointId], undefined, id()));
  const lengthId = id(); await replace('add-length', addSketchConstraint(source(engine, 'draw'), 'length', [line.id], 20, lengthId));
  await replace('edit-dimension', editSketchConstraint(source(engine, 'draw'), lengthId, { value: 25 }));
  await replace('remove-constraint', removeSketchConstraint(source(engine, 'draw'), lengthId));

  const beforeDrag = authority(engine), beforeHistory = engine.historyLength; let previews = 0, dragSolves = 0;
  const drag = new SketchDrag({ sketch: source(engine, 'draw'), pointId: line.endPointId, isCurrent: () => true,
    solve: async input => { dragSolves++; return solveDomainSketch(module, input); }, preview: () => { previews++; }, error: message => assert.fail(message), cancelSolve: () => {},
    commit: feature => engine.execute({ kind: 'replace-feature', feature }) });
  for (let i = 1; i <= 30; i++) drag.update([25 + i / 6, 50]); await drag.finish();
  assert.equal(engine.historyLength, beforeHistory + 1); assert.equal(dragSolves, 2); assert.equal(previews, 1);
  assert(Math.abs(source(engine, 'draw').points.find(p => p.id === line.endPointId).position[0] - 30) <= 1e-5);
  const afterDrag = authority(engine); engine.undo(); assert.deepEqual(authority(engine), beforeDrag); engine.redo(); assert.deepEqual(authority(engine), afterDrag);
  operations.push({ label: '30-input-drag', actualNativeSolves: dragSolves, successfulCommands: 1, exactUndoRedo: true });
  const beforeCancel = state(engine), cancel = new SketchDrag({ sketch: source(engine, 'draw'), pointId: line.endPointId, isCurrent: () => true,
    solve: async input => solveDomainSketch(module, input), preview: () => assert.fail('cancelled preview'), error: message => assert.fail(message), cancelSolve: () => {}, commit: () => assert.fail('cancelled commit') });
  cancel.update([40, 50]); cancel.cancel(); await cancel.finish(); await Promise.resolve(); assert.deepEqual(state(engine), beforeCancel);
  await replace('delete-line-and-owned-constraints', deleteSketchEntities(source(engine, 'draw'), [line.id]));
  assert.deepEqual(engine.diagnostics, {});
  await replace('draw-rectangle', drawingFeature(source(engine, 'draw'), 'rectangle', [{ position: [0, 0], snap: { kind: 'origin' } }, { position: [20, 20] }], id).feature);
  const rectangle = source(engine, 'draw');
  for (const [tool, samples] of [['circle', [[50, 0], [55, 0]]], ['arc', [[60, 0], [65, 5], [70, 0]]]]) {
    await replace(`draw-${tool}`, drawingFeature(source(engine, 'draw'), tool, samples.map(position => ({ position })), id).feature);
    await replace(`delete-${tool}`, deleteSketchEntities(source(engine, 'draw'), [source(engine, 'draw').entities.at(-1).id]));
  }
  assert.deepEqual(source(engine, 'draw'), rectangle);
  const region = selectSketchRegion(buildSketchRegions(rectangle)).definition;
  await command('extrude', { kind: 'add-feature', feature: { id: 'solid-draw', kind: 'extrude', name: '拉伸', visible: true, sketchId: 'draw', region, depth: 20 } }); volume(engine, 'solid-draw', 8000);
  await command('second-sketch', { kind: 'add-feature', feature: booleanBoxSketch('b', 'XY', 10) });
  await command('second-extrude', { kind: 'add-feature', feature: { id: 'solid-b', kind: 'extrude', name: 'B', visible: true, sketchId: 'b', region: selectSketchRegion(buildSketchRegions(source(engine, 'b'))).definition, depth: 20 } });
  await command('boolean', { kind: 'add-feature', feature: { id: 'join', kind: 'boolean', name: '交集', visible: true, operation: 'intersect', operandAId: 'solid-draw', operandBId: 'solid-b' } }); volume(engine, 'join', 4000);
  assert(!source(engine, 'solid-draw').visible && !source(engine, 'solid-b').visible);
  await replace('edit-extrusion-depth', { ...source(engine, 'solid-draw'), depth: 30 }); volume(engine, 'solid-draw', 12000); volume(engine, 'join', 4000);
  await command('rename-project', { kind: 'rename-project', name: '完整历史' });
  await command('rename-feature', { kind: 'rename-feature', id: 'join', name: '结果' });
  await command('hide', { kind: 'visibility', id: 'join', visible: false });
  await command('show', { kind: 'visibility', id: 'join', visible: true });
  const beforeRefusal = state(engine); await assert.rejects(engine.execute({ kind: 'delete-feature', id: 'draw', cascade: false }), code('DEPENDENTS_EXIST')); assert.deepEqual(state(engine), beforeRefusal);
  await command('cascade-delete', { kind: 'delete-feature', id: 'draw', cascade: true }); assert.deepEqual(engine.document.features.map(f => f.id), ['b', 'solid-b']);
  evidence.push({ id: 'all-command-families', operations, cancelledDragNoEntry: true, implicitCascadeRefusedWithoutEntry: true, toleranceMm: 1e-5, toleranceVolumeMm3: 1e-6, passed: true });
});

test('105 mixed real geometry/metadata commands retain exactly the newest 100 complete snapshots through 200 restores', async () => {
  const { engine, calls } = await boxes(), snapshots = [authority(engine)], edits = [];
  for (let i = 1; i <= 105; i++) {
    if (i % 3 === 0) {
      await engine.execute({ kind: 'replace-feature', feature: { ...source(engine, 'solid-a'), depth: 20 + i } });
      edits.push({ step: i, depthMm: 20 + i, actualVolumeMm3: volume(engine, 'solid-a', 400 * (20 + i)), actualIntersectionMm3: volume(engine, 'join', 4000) });
    } else if (i % 3 === 1) await engine.execute({ kind: 'rename-feature', id: 'join', name: `结果 ${i}` });
    else await engine.execute({ kind: 'visibility', id: 'join', visible: !source(engine, 'join').visible });
    snapshots.push(authority(engine));
    assert.equal(engine.historyLength, Math.min(100, 5 + i));
  }
  const unchanged = state(engine); assert.equal(await engine.execute({ kind: 'rename-project', name: engine.document.name }), false);
  await assert.rejects(engine.execute({ kind: 'replace-feature', feature: { ...source(engine, 'solid-a'), depth: 0 } }), code('SCHEMA_INVALID'));
  assert.deepEqual(state(engine), unchanged); const kernelsBeforeRestore = calls.length;
  for (let i = 104; i >= 5; i--) { assert(engine.undo()); assert.deepEqual(authority(engine), snapshots[i]); }
  assert.equal(engine.undo(), false); assert.equal(engine.canUndo, false);
  for (let i = 6; i <= 105; i++) { assert(engine.redo()); assert.deepEqual(authority(engine), snapshots[i]); }
  assert.equal(engine.redo(), false); assert.equal(engine.canRedo, false); assert.equal(calls.length, kernelsBeforeRestore);
  evidence.push({ id: '100-complete-snapshots', mixedSuccessfulCommands: 105, realGeometryEdits: edits, retainedCommands: 100, oldestReachableStep: 5, exactAuthorityRestores: 200, restoreKernelCalls: 0, noOpAndFailureNoCapacity: true, passed: true });
});

test('save fingerprint follows saved document rather than revision; delayed save, new branch and stale session are explicit', async () => {
  const { engine } = await boxes(); const initial = engine.captureSave(); engine.markSaved(initial); assert(!engine.dirty);
  await engine.execute({ kind: 'replace-feature', feature: { ...source(engine, 'solid-a'), depth: 30 } }); const saved = engine.captureSave(), savedAuthority = authority(engine);
  await engine.execute({ kind: 'rename-project', name: '保存期间的修改' }); engine.markSaved(saved); assert(engine.dirty);
  engine.undo(); assert.deepEqual(authority(engine), savedAuthority); assert(!engine.dirty); assert(engine.revision > saved.revision);
  engine.undo(); assert(engine.dirty); engine.redo(); assert(!engine.dirty); engine.redo(); assert(engine.dirty); engine.undo();
  const retained = state(engine); assert.equal(await engine.execute({ kind: 'rename-project', name: engine.document.name }), false); assert.deepEqual(state(engine), retained);
  await assert.rejects(engine.execute({ kind: 'replace-feature', feature: { ...source(engine, 'solid-a'), depth: 0 } }), code('SCHEMA_INVALID')); assert.deepEqual(state(engine), retained);
  await engine.execute({ kind: 'visibility', id: 'join', visible: false }); assert(!engine.canRedo); assert(engine.dirty); engine.undo(); assert(!engine.dirty); assert.deepEqual(authority(engine), savedAuthority);
  const beforeBadToken = state(engine); assert.throws(() => engine.markSaved({ ...saved, fingerprint: 'forged' }), code('INVALID_SAVE_TOKEN')); assert.deepEqual(state(engine), beforeBadToken);
  engine.resetEmpty(createEmptyProject()); assert.equal(engine.historyLength, 0); assert(!engine.dirty); assert.equal(engine.markSaved(saved), false);
  evidence.push({ id: 'saved-fingerprint-and-branch', delayedSaveRemainsDirtyUntilExactSnapshot: true, monotonicallyIncreasingRevisionIndependentOfDirty: true, noOpFailurePreserveRedo: true, successfulBranchClearsRedo: true, forgedTokenRejected: true, oldSessionSaveIgnored: true, actualSavedVolumesMm3: Object.fromEntries(Object.entries(savedAuthority.cache).map(([id, mesh]) => [id, meshMetrics(mesh).signedVolume])), passed: true });
});

test('repeated undo/redo while a real completed descendant mesh is held cannot commit partially; cancelled reply preserves redo and save bytes', async () => {
  const { engine, hold } = await boxes(); engine.markSaved(engine.captureSave()); await engine.execute({ kind: 'rename-project', name: '可重做' }); const named = authority(engine); engine.undo();
  const before = state(engine); let release, computed, notify; const ready = new Promise(resolve => { notify = resolve; });
  hold(async result => { computed = result; notify(); await new Promise(resolve => { release = resolve; }); });
  const pending = engine.execute({ kind: 'replace-feature', feature: { ...source(engine, 'solid-a'), depth: 30 } }); await ready;
  assert.equal(meshMetrics(computed.cache['solid-a']).signedVolume, 12000); assert.equal(meshMetrics(computed.cache.join).signedVolume, 4000);
  assert(engine.busy && !engine.canUndo && !engine.canRedo);
  for (let i = 0; i < 20; i++) { assert.throws(() => engine.undo(), code('TRANSACTION_BUSY')); assert.throws(() => engine.redo(), code('TRANSACTION_BUSY')); }
  await assert.rejects(engine.execute({ kind: 'rename-project', name: '冲突提交' }), code('TRANSACTION_BUSY')); assert.deepEqual(authority(engine), { document: before.document, cache: before.cache, diagnostics: before.diagnostics });
  assert(engine.cancelPending()); assert.deepEqual(state(engine), before); release(); await assert.rejects(pending, code('STALE_TRANSACTION')); assert.deepEqual(state(engine), before);
  assert(engine.redo()); assert.deepEqual(authority(engine), named); engine.undo(); assert(!engine.dirty); hold(undefined);
  await engine.execute({ kind: 'replace-feature', feature: { ...source(engine, 'solid-a'), depth: 30 } }); volume(engine, 'solid-a', 12000); assert(!engine.canRedo);
  evidence.push({ id: 'busy-undo-and-real-late-reply', actualHeldVolumesMm3: { source: 12000, descendant: 4000 }, rejectedUndoRedoCalls: 40, conflictingCommandRejected: true, oldAuthorityHistorySaveBytesExact: true, redoPreservedUntilRecoveryCommit: true, recoveryPassed: true, passed: true });
});

after(() => {
  assert.deepEqual(nativeErrors, []);
  writeFileSync('docs/learning/evidence/T-303-history-node.json', JSON.stringify({ task: 'T-303', requirement: 'REQ-009', executedAt: new Date().toISOString(), command: 'npm run check:history', environment: { node: process.version, platform: process.platform, solver: 'SolveSpace 2879a02d WASM', csg: '8bd00fe9', three: '0.186.1' }, evidence, passed: evidence.length === 4,
    limitations: ['Save token acknowledgement tested; actual file writing/opening remains T-401.', '100-entry history tested with small real meshes; final performance acceptance remains T-403.'] }, null, 2) + '\n');
});
