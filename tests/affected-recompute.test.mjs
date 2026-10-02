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
import { booleanBoxSketch } from '../src/experiments/mesh-boolean-fixtures.ts';
const nativeErrors = [], module = await createModule({ printErr: e => nativeErrors.push(e) }), evidence = [];
const authority = engine => ({ document: engine.document, cache: engine.cache, diagnostics: engine.diagnostics });
const snapshot = engine => ({ ...authority(engine), revision: engine.revision, history: engine.historyLength, canRedo: engine.canRedo, dirty: engine.dirty, saveBytes: serializeProject(engine.captureSave().document) });
async function setup() {
  const calls = [], recompute = featureRecompute(async input => { calls.push({ kind: 'solve', id: input.sketch.id }); return solveDomainSketch(module, input); }, async input => {
    const call = { kind: input.kind, id: input.sketch?.id, operation: input.operation }; calls.push(call);
    try { const mesh = runSolid(input); call.actual = meshMetrics(mesh); return mesh; } catch (e) { call.errorCode = e.code; throw e; }
  });
  const engine = new ProjectEngine(createEmptyProject(), { recompute });
  for (const [id, x] of [['a', 0], ['b', 10], ['c', 50]]) {
    await engine.execute({ kind: 'add-feature', feature: booleanBoxSketch(id, 'XY', x) }); const sketch = engine.document.features.find(f => f.id === id);
    await engine.execute({ kind: 'add-feature', feature: { id: `solid-${id}`, kind: 'extrude', name: id, visible: true, sketchId: id, region: selectSketchRegion(buildSketchRegions(sketch)).definition, depth: 20 } });
  }
  await engine.execute({ kind: 'add-feature', feature: { id: 'join', kind: 'boolean', name: '交集', visible: true, operation: 'intersect', operandAId: 'solid-a', operandBId: 'solid-b' } });
  await engine.execute({ kind: 'add-feature', feature: { id: 'result', kind: 'boolean', name: '并集', visible: true, operation: 'union', operandAId: 'join', operandBId: 'solid-c' } }); calls.length = 0;
  return { engine, calls, recompute };
}
test('one source edit runs only its real solver/extrusion/Boolean descendants and reuses independent caches/diagnostics', async () => {
  const { engine, calls } = await setup(), before = authority(engine), source = engine.document.features.find(f => f.id === 'a');
  for (const c of source.constraints) if (['a-outer-p1', 'a-outer-p2'].includes(c.refs[0].pointId)) c.fixedPosition[0] = 25;
  await engine.execute({ kind: 'replace-feature', feature: source }); const after = authority(engine);
  assert.deepEqual(calls.map(c => [c.kind, c.id ?? c.operation]), [['solve', 'a'], ['sketch-extrusion', 'a'], ['mesh-boolean', 'intersect'], ['mesh-boolean', 'union']]);
  for (const id of ['solid-b', 'solid-c']) assert.deepEqual(engine.cache[id], before.cache[id]); for (const id of ['b', 'c']) assert.deepEqual(engine.diagnostics[id], before.diagnostics[id]);
  const volumes = ['solid-a', 'join', 'result'].map(id => meshMetrics(engine.cache[id]).signedVolume); volumes.forEach((v, i) => assert(Math.abs(v - [10000, 6000, 14000][i]) < 1e-6));
  engine.undo(); assert.deepEqual(authority(engine), before); engine.redo(); assert.deepEqual(authority(engine), after);
  evidence.push({ id: 'one-source-affected-chain', actualCalls: calls, reusedIds: ['b', 'solid-b', 'c', 'solid-c'], actualVolumesMm3: volumes, exactCacheDiagnosticsUndoRedo: true });
});
test('depth edits skip solvers; new Boolean skips all existing geometry; metadata replacement ignores key insertion order', async () => {
  const { engine, calls } = await setup(), source = engine.document.features.find(f => f.id === 'solid-a'); source.depth = 30;
  await engine.execute({ kind: 'replace-feature', feature: source }); const depthCalls = structuredClone(calls); assert.deepEqual(calls.map(c => [c.kind, c.id ?? c.operation]), [['sketch-extrusion', 'a'], ['mesh-boolean', 'intersect'], ['mesh-boolean', 'union']]);
  calls.length = 0; await engine.execute({ kind: 'add-feature', feature: { id: 'new', kind: 'boolean', name: '新布尔', visible: true, operation: 'subtract', operandAId: 'solid-b', operandBId: 'solid-c' } }); const newCalls = structuredClone(calls); assert.equal(calls.length, 1); assert.equal(calls[0].kind, 'mesh-boolean');
  calls.length = 0; const before = engine.cache, existing = engine.document.features.find(f => f.id === 'b');
  const reordered = Object.fromEntries(Object.entries(existing).reverse()); reordered.name = '换名'; reordered.visible = !existing.visible;
  await engine.execute({ kind: 'replace-feature', feature: reordered }); await engine.execute({ kind: 'rename-feature', id: 'result', name: '换结果名称' }); await engine.execute({ kind: 'visibility', id: 'result', visible: false });
  assert.equal(calls.length, 0); assert.deepEqual(engine.cache, before);
  evidence.push({ id: 'depth-add-metadata', depthCalls, newBooleanCalls: newCalls, metadataNativeMeshCalls: 0, reorderedObjectKeysNoGeometryChange: true });
});
test('cascade deletion filters obsolete cache/diagnostics while making zero real calls for remaining independent branches', async () => {
  const { engine, calls } = await setup(), before = authority(engine); await engine.execute({ kind: 'delete-feature', id: 'c', cascade: true });
  assert.equal(calls.length, 0); assert.deepEqual(Object.keys(engine.cache).sort(), ['join', 'solid-a', 'solid-b']); assert.deepEqual(Object.keys(engine.diagnostics).sort(), ['a', 'b']);
  for (const id of Object.keys(engine.cache)) assert.deepEqual(engine.cache[id], before.cache[id]); engine.undo(); assert.deepEqual(authority(engine), before);
  evidence.push({ id: 'cascade-cache-eviction', actualCalls: 0, removedIds: ['c', 'solid-c', 'result'], remainingCachesExact: true, exactUndo: true });
});
test('a later affected Boolean rejects empty input and preserves all reused state, save snapshot and redo branch', async () => {
  const { engine, calls } = await setup(); engine.markSaved(engine.captureSave()); await engine.execute({ kind: 'rename-project', name: '重做项' }); const renamed = authority(engine); engine.undo(); const before = snapshot(engine);
  const source = engine.document.features.find(f => f.id === 'a'); source.plane.origin[2] = 20;
  await assert.rejects(engine.execute({ kind: 'replace-feature', feature: source }), e => e.code === 'BOOLEAN_EMPTY_OPERAND'); assert.deepEqual(snapshot(engine), before);
  assert.deepEqual(calls.map(c => [c.kind, c.id ?? c.operation]), [['solve', 'a'], ['sketch-extrusion', 'a'], ['mesh-boolean', 'intersect'], ['mesh-boolean', 'union']]); assert.equal(calls[2].actual.triangles, 0); assert.equal(calls[3].errorCode, 'BOOLEAN_EMPTY_OPERAND');
  engine.redo(); assert.deepEqual(authority(engine), renamed); engine.undo(); assert(!engine.dirty);
  evidence.push({ id: 'affected-late-failure', actualCalls: calls, oldAuthorityRevisionHistorySaveBytesExact: true, redoPreserved: true });
});
test('cold recompute and missing native diagnostics fall back to actual solving; transaction baseline is immutable', async () => {
  const { engine, calls, recompute } = await setup(), before = authority(engine), context = { baseRevision: engine.revision, requestId: 1, projectSessionId: engine.projectSessionId, isCancelled: () => false };
  const cold = await recompute(engine.document, context); assert.equal(calls.filter(c => c.kind === 'solve').length, 3); assert.deepEqual(cold, before);
  calls.length = 0; const repaired = await recompute(engine.document, { ...context, baseline: { ...before, diagnostics: {} } }); assert.equal(calls.filter(c => c.kind === 'solve').length, 3); assert.deepEqual(repaired, before);
  let frozen = false; const guard = new ProjectEngine(createEmptyProject(), { recompute: async (candidate, context) => {
    assert(Object.isFrozen(context.baseline) && Object.isFrozen(context.baseline.document.features)); assert.throws(() => { context.baseline.document.name = '篡改'; }, TypeError); frozen = true;
    return { document: candidate, cache: {}, diagnostics: {} };
  } }); await guard.execute({ kind: 'add-feature', feature: { id: 'empty', kind: 'sketch', name: '空', visible: true, plane: before.document.features[0].plane, points: [], entities: [], constraints: [] } });
  assert(frozen); evidence.push({ id: 'cold-and-immutable-baseline', coldNativeSolves: 3, missingDiagnosticsNativeSolves: 3, exactRebuiltAuthority: true, baselineFrozenNoAuthorityMutation: true });
});
after(() => {
  assert.equal(nativeErrors.length, 0, nativeErrors.join('\n'));
  writeFileSync(process.env.AFFECTED_RECOMPUTE_EVIDENCE_PATH ?? 'docs/learning/evidence/T-302A-affected-recompute.json', JSON.stringify({ task: process.env.AFFECTED_RECOMPUTE_EVIDENCE_TASK ?? 'T-302A', executedAt: new Date().toISOString(), command: 'npm run check:affected-recompute', environment: { node: process.version, platform: process.platform, three: '0.186.1', solver: 'unchanged SolveSpace 2879a02d WASM', csg: 'unchanged 8bd00fe9' }, tests: 5, evidence, nativeErrors, passed: evidence.length === 5,
    limitations: ['Cascade core behavior tested; affected-list confirmation UI is outside this Node check.', 'Actual kernel call counts measured, not final performance acceptance.'] }, null, 2) + '\n');
});
