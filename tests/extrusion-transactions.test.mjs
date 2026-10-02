import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { featureRecompute } from '../src/app/feature-recompute.ts';
import { ExtrusionPreview } from '../src/app/extrusion-preview.ts';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { serializeProject } from '../src/core/model/validate-document.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { domainRectangle } from '../src/experiments/domain-solver-fixtures.ts';
import { ProjectSession } from '../src/app/project-session.ts';
const errors = [], module = await createModule({ printErr: e => errors.push(e) }), evidence = [];
const pipeline = featureRecompute(async input => solveDomainSketch(module, input), async input => runSolid(input));
const snapshot = engine => ({ document: engine.document, cache: engine.cache, diagnostics: engine.diagnostics, projectSessionId: engine.projectSessionId, revision: engine.revision, history: engine.historyLength, savedContent: serializeProject(engine.captureSave().document) });
async function setup() {
  const engine = new ProjectEngine(createEmptyProject(), { recompute: pipeline }); await engine.execute({ kind: 'add-feature', feature: domainRectangle() });
  const sketch = engine.document.features[0], feature = { id: 'extrude', kind: 'extrude', name: '拉伸1', visible: true, sketchId: sketch.id,
    region: selectSketchRegion(buildSketchRegions(sketch)).definition, depth: 10 };
  return { engine, sketch, feature };
}
test('real sketch/extrude geometry, native diagnostics and source definition commit and undo/redo atomically', async () => {
  const { engine, feature } = await setup(); await engine.execute({ kind: 'add-feature', feature }); const first = snapshot(engine);
  assert.equal(meshMetrics(engine.cache.extrude).signedVolume, 12000); assert.equal(engine.diagnostics.rectangle.dof, 0);
  const wider = engine.document.features[0]; wider.constraints.find(c => c.id === 'width').value = 60;
  await engine.execute({ kind: 'replace-feature', feature: wider }); const second = snapshot(engine); assert(Math.abs(meshMetrics(engine.cache.extrude).signedVolume - 18000) < 1e-6);
  const deeper = { ...engine.document.features[1], depth: -20 }; await engine.execute({ kind: 'replace-feature', feature: deeper }); const third = snapshot(engine);
  const measured = meshMetrics(engine.cache.extrude); assert.equal(measured.signedVolume, 36000); assert.deepEqual(measured.bounds, { min: [0, 0, -20], max: [60, 30, 0] });
  engine.undo(); assert.deepEqual(engine.cache, second.cache); assert.deepEqual(engine.document, second.document); assert.deepEqual(engine.diagnostics, second.diagnostics);
  engine.undo(); assert.deepEqual(engine.cache, first.cache); assert.deepEqual(engine.document, first.document);
  engine.redo(); engine.redo(); assert.deepEqual(engine.cache, third.cache); assert.deepEqual(engine.document, third.document);
  const saved = JSON.parse(serializeProject(engine.document)); assert.deepEqual(saved.features[1].region, feature.region); assert.equal(saved.features[1].depth, -20);
  assert(!Object.hasOwn(saved, 'cache')); assert(!Object.hasOwn(saved, 'diagnostics'));
  evidence.push({ id: 'native-and-solid-atomic-history', volumesMm3: [12000, 18000, 36000], signedDepthBounds: measured.bounds,
    sourceDefinition: saved.features[1], diagnostics: engine.diagnostics, historyLength: engine.historyLength, exactUndoRedo: true });
});
test('native conflict, invalid region and zero depth preserve document/cache/diagnostics/history/save bytes', async () => {
  const { engine, feature } = await setup(); await engine.execute({ kind: 'add-feature', feature }); const before = snapshot(engine), failures = [];
  const conflict = engine.document.features[0]; conflict.constraints.push({ id: 'conflict', kind: 'length', refs: [{ entityId: 'bottom' }], value: 50 });
  for (const [candidate, code] of [[conflict, 'SOLVER_REJECTED'], [{ ...feature, region: { outerEntityIds: ['bottom'], holeEntityIds: [] } }, 'REGION_MISSING'], [{ ...feature, depth: 0 }, 'SCHEMA_INVALID']]) {
    await assert.rejects(engine.execute({ kind: 'replace-feature', feature: candidate }), e => e.code === code); assert.deepEqual(snapshot(engine), before); failures.push({ code, snapshotExact: true });
  }
  const cacheBefore = engine.cache; await engine.execute({ kind: 'rename-feature', id: 'extrude', name: '新名称' }); assert.deepEqual(engine.cache, cacheBefore);
  evidence.push({ id: 'failed-candidates', before, failures, metadataCachePreserved: true });
});
test('thirty depth updates execute only first and latest real meshes and commit exactly one history entry', async () => {
  const { engine, sketch, feature } = await setup(); const baseline = snapshot(engine), session = engine.projectSessionId, calls = [], previews = [], failures = []; let cancellations = 0;
  const current = () => engine.revision === baseline.revision && engine.projectSessionId === session && !engine.busy;
  const preview = new ExtrusionPreview({ sketch, feature, isCurrent: current,
    run: input => { const actualMesh = runSolid(input); return new Promise(resolve => calls.push({ input, actualMesh, release: () => resolve(actualMesh) })); },
    cancelRun: () => cancellations++, preview: value => { if (value) previews.push({ depth: value.depth, actual: meshMetrics(value.mesh) }); }, error: message => failures.push(message),
    commit: async feature => engine.execute({ kind: 'add-feature', feature }),
  });
  for (let depth = 1; depth <= 30; depth++) preview.update(depth); assert.equal(calls.length, 1); assert.deepEqual(snapshot(engine), baseline);
  const finish = preview.finish(); calls[0].release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 2); assert.equal(calls[1].input.depth, 30);
  assert.equal(previews.length, 0); assert.deepEqual(snapshot(engine), baseline); calls[1].release(); assert.equal(await finish, true);
  assert.equal(previews.length, 1); assert.equal(previews[0].depth, 30); assert.equal(engine.historyLength, baseline.history + 1);
  assert.equal(meshMetrics(engine.cache.extrude).signedVolume, 36000); assert.equal(engine.document.features[1].depth, 30); assert.equal(failures.length, 0); assert.equal(cancellations, 1);
  evidence.push({ id: 'latest-depth-queue', inputCount: 30, actualRequests: calls.map(c => ({ depth: c.input.depth, volumeMm3: meshMetrics(c.actualMesh).signedVolume })),
    publishedPreviews: previews, previewNoAuthorityWrites: true, oneHistoryEntry: true });
});
test('cancelled or obsolete delayed real mesh cannot publish or enter history', async () => {
  const outcomes = [];
  for (const action of ['cancel', 'rename', 'new-project']) {
    const { engine, sketch, feature } = await setup(); const baseline = snapshot(engine), session = engine.projectSessionId; let release, commits = 0; const published = [];
    const preview = new ExtrusionPreview({ sketch, feature, isCurrent: () => engine.revision === baseline.revision && engine.projectSessionId === session && !engine.busy,
      run: input => { const actual = runSolid(input); return new Promise(resolve => release = () => resolve(actual)); }, cancelRun: () => {},
      preview: value => { if (value) published.push(value); }, error: () => {}, commit: async () => commits++,
    }); preview.update(10);
    if (action === 'cancel') preview.cancel(); else if (action === 'rename') await engine.execute({ kind: 'rename-project', name: 'new revision' }); else engine.resetEmpty(createEmptyProject());
    const held = snapshot(engine); release(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(snapshot(engine), held); assert.equal(published.length, 0); assert.equal(commits, 0);
    if (action === 'cancel') assert.equal(await preview.finish(), false); else await assert.rejects(preview.finish(), e => e.code === 'STALE_PREVIEW');
    outcomes.push({ action, noPublishedMesh: true, noCommit: true, snapshotExact: true });
  }
  evidence.push({ id: 'late-real-mesh', outcomes });
});
test('invalid latest preview clears success, refuses finish, and can recover with a valid depth', async () => {
  const { engine, sketch, feature } = await setup(), baseline = snapshot(engine), values = [], messages = [];
  const preview = new ExtrusionPreview({ sketch, feature, isCurrent: () => engine.revision === baseline.revision,
    run: async input => runSolid(input), cancelRun: () => {}, preview: value => values.push(value ? value.depth : null), error: m => messages.push(m),
    commit: async feature => engine.execute({ kind: 'add-feature', feature }),
  }); preview.update(10); await new Promise(resolve => setImmediate(resolve)); assert.equal(values.at(-1), 10);
  preview.update(0); await new Promise(resolve => setImmediate(resolve)); assert.equal(values.at(-1), null); assert.equal(messages.length, 1);
  await assert.rejects(preview.finish(), e => e.code === 'INVALID_EXTRUSION_DEPTH'); assert.deepEqual(snapshot(engine), baseline);
  preview.update(-10); await new Promise(resolve => setImmediate(resolve)); assert.equal(values.at(-1), -10); assert(await preview.finish());
  assert.equal(engine.document.features[1].depth, -10); assert.equal(meshMetrics(engine.cache.extrude).signedVolume, 12000);
  evidence.push({ id: 'failed-preview-recovery', values, invalidDepthMessage: messages[0], failureUnchanged: true, committedDepth: -10 });
});
test('cancelled feature recompute cannot commit a late real solid cache', async () => {
  const { engine, feature } = await setup(); const document = engine.document; let release, started; const entered = new Promise(resolve => started = resolve);
  const delayed = new ProjectEngine(document, { diagnostics: engine.diagnostics, recompute: async (candidate, context) => {
    const actual = await pipeline(candidate, context); started(); await new Promise(resolve => release = resolve); return actual;
  } });
  const pending = delayed.execute({ kind: 'add-feature', feature }); const rejected = assert.rejects(pending, e => e.code === 'STALE_TRANSACTION');
  await entered; delayed.cancelPending(); const held = snapshot(delayed); release(); await rejected; assert.deepEqual(snapshot(delayed), held);
  evidence.push({ id: 'late-atomic-cache', realMeshComputedBeforeDelay: true, cacheRejected: true, documentHistoryDiagnosticsExact: true });
});
test('old cancelled commit cleanup cannot terminate a newer preview client in the same project session', async () => {
  const originalWorker = globalThis.Worker, ports = []; let solidRequests = 0;
  class ActualGeometryPort {
    onmessage = null; onerror = null; onmessageerror = null; terminated = false;
    constructor(url) { this.url = String(url); ports.push(this); }
    postMessage(data) {
      const { input, ...meta } = data; let reply;
      try { reply = { ...meta, ok: true, output: this.url.includes('document-solver') ? solveDomainSketch(module, input) : runSolid(input) }; }
      catch (cause) { reply = { ...meta, ok: false, error: cause.message, code: cause.code }; }
      const hold = this.url.includes('solid.worker') && ++solidRequests === 2;
      if (!hold) setImmediate(() => { if (!this.terminated) this.onmessage?.({ data: reply }); });
    }
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = ActualGeometryPort; const session = new ProjectSession(), oldValues = [], newValues = [];
  try {
    await session.execute({ kind: 'add-feature', feature: domainRectangle() }); const initial = session.snapshot(), sketch = initial.document.features[0];
    const region = selectSketchRegion(buildSketchRegions(sketch)).definition;
    const old = session.beginExtrusion(sketch.id, region, value => { if (value) oldValues.push(value.depth); }, () => {});
    old.update(10); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(oldValues, [10]);
    const finishing = old.finish(), rejected = assert.rejects(finishing, e => /DISPOSED|STALE/.test(e.code ?? e.message));
    while (!session.snapshot().busy || solidRequests < 2) await new Promise(resolve => setImmediate(resolve));
    session.cancelPending();
    const latest = session.beginExtrusion(sketch.id, region, value => { if (value) newValues.push(value.depth); }, () => {}); latest.update(20);
    const newestPort = ports.at(-1); await rejected; await new Promise(resolve => setImmediate(resolve));
    assert(!newestPort.terminated); assert.deepEqual(newValues, [20]); assert.equal(session.snapshot().revision, initial.revision);
    assert(await latest.finish()); assert.equal(session.snapshot().document.features[1].depth, 20); assert.equal(meshMetrics(session.derivedCache[session.snapshot().document.features[1].id]).signedVolume, 24000);
    evidence.push({ id: 'preview-client-ownership', transport: 'Controlled ports execute actual native solver/actual mesh, delay second solid reply only',
      oldCancelled: true, newPreviewDepth: 20, newClientSurvivedOldFinally: true, committedVolumeMm3: 24000 });
  } finally { session.dispose(); if (originalWorker === undefined) delete globalThis.Worker; else globalThis.Worker = originalWorker; }
});
after(() => {
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync(process.env.EXTRUSION_TRANSACTION_EVIDENCE_PATH ?? 'docs/learning/evidence/T-202C2a-transactions.json', JSON.stringify({ task: process.env.EXTRUSION_TRANSACTION_EVIDENCE_TASK ?? 'T-202C2a', executedAt: new Date().toISOString(), command: 'npm run check:extrusion-transactions',
    environment: { node: process.version, platform: process.platform, three: '0.186.1', solver: 'unchanged SolveSpace 2879a02d WASM' }, tests: 7, evidence, nativeErrors: errors, passed: evidence.length === 7,
    method: 'Delayed promises wrap actual native solutions and actual double extrusion meshes; no simulated geometry success.',
    limitations: ['Application pipeline/preview service coverage; workspace UI uses separate browser checks.', 'Sketch/Extrude/Boolean affected recompute exists; full feature/file workflow remains separate acceptance.'] }, null, 2) + '\n');
});
