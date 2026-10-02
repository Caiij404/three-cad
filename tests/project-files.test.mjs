import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { featureRecompute } from '../src/app/feature-recompute.ts';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { parseProjectJson, serializeProject } from '../src/core/model/validate-document.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { booleanBoxSketch } from '../src/experiments/mesh-boolean-fixtures.ts';
import { contourFixture } from '../src/experiments/region-fixtures.ts';

const nativeErrors = [], module = await createModule({ printErr: e => nativeErrors.push(e) }), evidence = [];
const authority = engine => ({ document: engine.document, cache: engine.cache, diagnostics: engine.diagnostics });
const state = engine => ({ ...authority(engine), session: engine.projectSessionId, revision: engine.revision, history: engine.historyLength, dirty: engine.dirty, canUndo: engine.canUndo, canRedo: engine.canRedo, bytes: serializeProject(engine.captureSave().document) });
const code = expected => e => e.code === expected;
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { assert(Date.now() < deadline, 'real rebuild did not reach held result'); await new Promise(resolve => setImmediate(resolve)); }
}
function setup() {
  const calls = [], pipeline = featureRecompute(async input => { calls.push({ kind: 'solve', id: input.sketch.id }); return solveDomainSketch(module, input); }, async input => {
    const call = { kind: input.kind, id: input.sketch?.id, operation: input.operation }; calls.push(call);
    try { const mesh = runSolid(input); call.actualVolumeMm3 = meshMetrics(mesh).signedVolume; return mesh; } catch (e) { call.code = e.code; throw e; }
  });
  let intercept;
  const engine = new ProjectEngine(createEmptyProject(), { recompute: async (document, context) => {
    const result = await pipeline(document, context); return intercept ? intercept(result, context) : result;
  } });
  return { engine, calls, intercept: callback => { intercept = callback; } };
}
async function addSolid(engine, sketch, id, depth = 20) {
  await engine.execute({ kind: 'add-feature', feature: sketch }); const solved = engine.document.features.find(f => f.id === sketch.id);
  await engine.execute({ kind: 'add-feature', feature: { id, kind: 'extrude', name: id, visible: true, sketchId: sketch.id, region: selectSketchRegion(buildSketchRegions(solved)).definition, depth } });
}
async function boxes(plane = 'XY') {
  const fixture = setup(), { engine } = fixture;
  await addSolid(engine, booleanBoxSketch('a', plane), 'solid-a'); await addSolid(engine, booleanBoxSketch('b', plane, 10), 'solid-b');
  await engine.execute({ kind: 'add-feature', feature: { id: 'join', kind: 'boolean', name: '交集', visible: true, operation: 'intersect', operandAId: 'solid-a', operandBId: 'solid-b' } }); return fixture;
}
function volume(mesh, expected, relative = false) { const actual = meshMetrics(mesh); assert(actual.closed && actual.windingErrors === 0); assert(Math.abs(actual.signedVolume - expected) <= (relative ? expected * 0.01 : 1e-6)); return actual; }

test('JSON domain-only roundtrip cold-rebuilds actual three-plane DAGs with stable IDs, visibility, camera and continued editing', async () => {
  const cases = [];
  for (const plane of ['XY', 'XZ', 'YZ']) {
    const { engine, calls } = await boxes(plane); await engine.execute({ kind: 'rename-project', name: '<img src=x onerror=alert(1)> 数据' });
    const original = engine.document; original.view = { position: [175, -150, 200], target: [5, 7, 2], up: [0, 0, 1], projection: 'orthographic', zoom: 2.5 };
    const text = serializeProject(original), decoded = parseProjectJson(text); assert.deepEqual(decoded, original);
    assert.deepEqual(Object.keys(decoded).sort(), ['schemaVersion', 'id', 'name', 'units', 'features', 'view', 'createdAt', 'updatedAt'].sort());
    assert(!/"(cache|diagnostics|history|positions|pointer)"\s*:/.test(text));
    const before = state(engine), oldSaved = engine.captureSave(); calls.length = 0; await engine.openDocument(decoded);
    assert.notEqual(engine.projectSessionId, before.session); assert.equal(engine.revision, before.revision + 1); assert.equal(engine.historyLength, 0); assert(!engine.dirty && !engine.canUndo && !engine.canRedo);
    assert.deepEqual(engine.document, original); assert.deepEqual(engine.cache, before.cache); assert.deepEqual(engine.diagnostics, before.diagnostics);
    assert.deepEqual(calls.map(c => [c.kind, c.id ?? c.operation]), [['solve', 'a'], ['solve', 'b'], ['sketch-extrusion', 'a'], ['sketch-extrusion', 'b'], ['mesh-boolean', 'intersect']]);
    const coldCalls = structuredClone(calls), loaded = authority(engine);
    await engine.execute({ kind: 'replace-feature', feature: { ...engine.document.features.find(f => f.id === 'solid-a'), depth: 30 } }); volume(engine.cache['solid-a'], 12000); volume(engine.cache.join, 4000);
    engine.undo(); assert.deepEqual(authority(engine), loaded); assert(!engine.dirty); engine.redo(); assert(engine.dirty); assert.equal(engine.markSaved(oldSaved), false);
    cases.push({ plane, bytes: new TextEncoder().encode(text).byteLength, actualColdCalls: coldCalls, idsDefinitionsVisibilityCameraExact: true, actualVolumesMm3: { a: 8000, b: 8000, intersect: 4000, editedA: 12000 }, openedCleanAndEmptyHistory: true, oldSaveTokenIgnored: true, editUndoRedoPassed: true });
  }
  evidence.push({ id: 'three-plane-json-rebuild', cases, toleranceVolumeMm3: 1e-6, passed: true });
});

test('holes and circle JSON recreate meshes from domain geometry and restore the same editable source', async () => {
  const cases = [];
  for (const [id, loops, expected] of [
    ['hole', [{ kind: 'polygon', id: 'outer', points: [[0, 0], [40, 0], [40, 30], [0, 30]] }, { kind: 'polygon', id: 'inner', points: [[15, 10], [25, 10], [25, 20], [15, 20]] }], 11000],
    ['circle', [{ kind: 'circle', id: 'loop', center: [0, 0], radius: 10 }], 1000 * Math.PI],
  ]) {
    const { engine, calls } = setup(); await addSolid(engine, contourFixture(id, loops), 'solid', 10); const before = authority(engine), text = serializeProject(engine.document); calls.length = 0;
    await engine.openDocument(parseProjectJson(text)); assert.deepEqual(authority(engine), before); const metrics = volume(engine.cache.solid, expected, id === 'circle');
    cases.push({ id, expectedVolumeMm3: expected, actual: metrics, actualColdCalls: calls, exactRebuiltDocumentCacheDiagnostics: true });
  }
  evidence.push({ id: 'hole-and-circle-json-rebuild', cases, curveVolumeToleranceRelative: 0.01, passed: true });
});

test('invalid JSON/schema/references/nonfinite/oversized files and corrupt native results preserve current authority, redo and save bytes', async () => {
  const { engine, intercept } = await boxes(); engine.markSaved(engine.captureSave()); await engine.execute({ kind: 'rename-project', name: 'redo' }); engine.undo(); const before = state(engine), base = engine.document;
  const invalid = [], raw = JSON.stringify(base), missing = structuredClone(base); missing.features.find(f => f.id === 'solid-a').sketchId = 'missing';
  const cycle = structuredClone(base); cycle.features.push({ id: 'loop', kind: 'boolean', name: '循环', visible: true, operation: 'union', operandAId: 'join', operandBId: 'solid-b' }); cycle.features.find(f => f.id === 'join').operandAId = 'loop';
  for (const [id, text, expected] of [['syntax', '{', 'INVALID_JSON'], ['version', JSON.stringify({ ...base, schemaVersion: 2 }), 'UNSUPPORTED_SCHEMA'], ['missing', JSON.stringify(missing), 'REFERENCE_MISSING'], ['cycle', JSON.stringify(cycle), 'FEATURE_CYCLE'],
    ['nonfinite', raw.replace('"zoom":1', '"zoom":1e309'), 'SCHEMA_INVALID'], ['unexpected-cache', JSON.stringify({ ...base, cache: engine.cache }), 'SCHEMA_INVALID'], ['oversized', ' '.repeat(10 * 1024 * 1024 + 1), 'FILE_TOO_LARGE']]) {
    assert.throws(() => parseProjectJson(text), code(expected)); assert.deepEqual(state(engine), before); invalid.push({ id, code: expected, oldStateExact: true });
  }
  const boundary = raw + ' '.repeat(10 * 1024 * 1024 - new TextEncoder().encode(raw).byteLength); assert.deepEqual(parseProjectJson(boundary), base);
  const largeDocument = createEmptyProject(); largeDocument.features = [{ id: 'large', kind: 'sketch', name: '大文档', visible: true, plane: base.features[0].plane,
    points: Array.from({ length: 60000 }, (_, i) => ({ id: 'p'.repeat(90) + i, position: [0, 0] })), entities: [], constraints: [] }];
  const oversizedSerializedBytes = new TextEncoder().encode(JSON.stringify(largeDocument, null, 2) + '\n').byteLength; assert(oversizedSerializedBytes > 10 * 1024 * 1024);
  assert.throws(() => serializeProject(largeDocument), code('FILE_TOO_LARGE')); assert.deepEqual(state(engine), before);
  for (const [id, alter, expected] of [
    ['changed-id', result => { result.document.id = 'changed'; }, 'RECOMPUTE_ID_CHANGED'],
    ['changed-definition', result => { result.document.features.find(f => f.id === 'solid-a').depth = 77; }, 'RECOMPUTE_DEFINITION_CHANGED'],
    ['missing-mesh', result => { delete result.cache.join; }, 'MISSING_DERIVED'],
    ['invalid-diagnostics', result => { result.diagnostics.a.dof = -1; }, 'INVALID_DIAGNOSTICS'],
  ]) {
    intercept(result => { alter(result); return result; }); await assert.rejects(engine.openDocument(base), code(expected)); assert.deepEqual(state(engine), before); assert(!engine.busy); invalid.push({ id, code: expected, oldStateExact: true });
  }
  intercept(undefined); evidence.push({ id: 'invalid-file-and-rebuild-results', invalid, exactTenMiBFileAccepted: true, oversizedSerializedBytes, oversizedOutputRefused: true, redoSavedBytesSessionRevisionPreserved: true, passed: true });
});

test('a late real Boolean failure cannot replace the current project after its predecessors have rebuilt', async () => {
  const { engine, calls } = await boxes(); engine.markSaved(engine.captureSave()); await engine.execute({ kind: 'rename-project', name: 'redo' }); engine.undo(); const before = state(engine), candidate = engine.document;
  candidate.features.find(f => f.id === 'a').plane.origin[2] = 20;
  candidate.features.push({ id: 'late', kind: 'boolean', name: '较晚union', visible: true, operation: 'union', operandAId: 'join', operandBId: 'solid-b' }); calls.length = 0;
  await assert.rejects(engine.openDocument(parseProjectJson(serializeProject(candidate))), code('BOOLEAN_EMPTY_OPERAND')); assert.deepEqual(state(engine), before); assert(!engine.busy);
  assert.equal(calls.at(-2).actualVolumeMm3, 0); assert.equal(calls.at(-1).code, 'BOOLEAN_EMPTY_OPERAND'); assert(engine.redo()); engine.undo(); assert(!engine.dirty);
  const failureCalls = structuredClone(calls); calls.length = 0; await engine.openDocument(parseProjectJson(before.bytes)); volume(engine.cache.join, 4000);
  evidence.push({ id: 'late-actual-geometry-failure', actualFailureCalls: failureCalls, oldProjectHistorySessionSavedBytesExact: true, recoveryActualCalls: calls, passed: true });
});

test('opening uses no old baseline even for the same IDs, disables busy history, rejects cancelled late result and protects a newer opening', async () => {
  const { engine, intercept } = await boxes(); const file = engine.document; engine.markSaved(engine.captureSave()); await engine.execute({ kind: 'rename-project', name: 'redo' }); engine.undo(); const before = state(engine), queue = [];
  intercept((result, context) => { assert.equal(context.baseline, undefined); return new Promise(resolve => { queue.push({ result, release: () => resolve(result) }); }); });
  const old = engine.openDocument(file), oldReject = assert.rejects(old, code('STALE_TRANSACTION')); await until(() => queue.length === 1);
  assert.equal(meshMetrics(queue[0].result.cache.join).signedVolume, 4000); assert(engine.busy && !engine.canUndo && !engine.canRedo); assert.deepEqual(authority(engine), { document: before.document, cache: before.cache, diagnostics: before.diagnostics });
  assert.throws(() => engine.undo(), code('TRANSACTION_BUSY')); await assert.rejects(engine.openDocument(file), code('TRANSACTION_BUSY'));
  assert(engine.cancelPending()); assert.deepEqual(state(engine), before);
  const newerFile = structuredClone(file); newerFile.name = '新打开'; const newer = engine.openDocument(newerFile); await until(() => queue.length === 2);
  queue[0].release(); await oldReject; assert(engine.busy); assert.deepEqual(engine.document, before.document); queue[1].release(); await newer;
  assert.equal(engine.document.name, '新打开'); assert.equal(engine.historyLength, 0); assert(!engine.dirty && !engine.busy); assert.notEqual(engine.projectSessionId, before.session);
  const openedSession = engine.projectSessionId; const resetPending = engine.openDocument(file), resetReject = assert.rejects(resetPending, code('STALE_TRANSACTION')); await until(() => queue.length === 3);
  engine.resetEmpty(createEmptyProject()); const reset = state(engine); queue[2].release(); await resetReject; assert.deepEqual(state(engine), reset); assert.notEqual(engine.projectSessionId, openedSession);
  evidence.push({ id: 'cancelled-and-newer-openings', heldActualIntersectionMm3: 4000, noOldBaseline: true, busyHistoryDisabled: true, cancelPreservesOldStateAndRedo: true, oldFinallyCannotClearNewBusy: true, newProjectRejectsLateOpen: true, passed: true });
});

after(() => {
  assert.deepEqual(nativeErrors, []);
  writeFileSync(process.env.PROJECT_FILES_EVIDENCE_PATH??'docs/learning/evidence/T-401A-project-files-node.json', JSON.stringify({ task: process.env.PROJECT_FILES_EVIDENCE_TASK??'T-401A', requirement: 'REQ-010 (foundation)', executedAt: new Date().toISOString(), command: 'npm run check:project-files', environment: { node: process.version, platform: process.platform, solver: 'SolveSpace 2879a02d WASM', csg: '8bd00fe9', three: '0.186.1' }, evidence, passed: evidence.length === 5,
    limitations: ['No file chooser, Blob download or browser camera capture yet: T-401B.', 'No IndexedDB/recovery flow yet: T-401C.', 'This evidence is real Node integration, not full REQ-010 or E2E-02 acceptance.'] }, null, 2) + '\n');
});
