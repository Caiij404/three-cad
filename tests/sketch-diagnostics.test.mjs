import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { serializeProject } from '../src/core/model/validate-document.ts';
import { sketchRecompute } from '../src/app/sketch-recompute.ts';
import { domainRectangle } from '../src/experiments/domain-solver-fixtures.ts';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
const errors = [], module = await createModule({ printErr: s => errors.push(s) }), evidence = [];
const pipeline = sketchRecompute(async input => solveDomainSketch(module, input));
const snapshot = engine => ({ document: engine.document, diagnostics: engine.diagnostics, history: engine.historyLength, revision: engine.revision, savedContent: serializeProject(engine.captureSave().document) });
test('real DOF and residuals follow successful geometry, undo/redo and metadata without entering the saved document', async () => {
  const engine = new ProjectEngine(createEmptyProject(), { recompute: pipeline });
  assert.deepEqual(engine.diagnostics, {}); await engine.execute({ kind: 'add-feature', feature: domainRectangle() });
  const constrained = snapshot(engine); assert.equal(engine.diagnostics.rectangle.dof, 0);
  const released = engine.document.features[0]; released.constraints = released.constraints.filter(c => c.id !== 'width');
  await engine.execute({ kind: 'replace-feature', feature: released }); const free = snapshot(engine); assert.equal(engine.diagnostics.rectangle.dof, 1);
  engine.undo(); assert.deepEqual(engine.document, constrained.document); assert.deepEqual(engine.diagnostics, constrained.diagnostics);
  engine.redo(); assert.deepEqual(engine.document, free.document); assert.deepEqual(engine.diagnostics, free.diagnostics);
  const copy = engine.diagnostics; copy.rectangle.dof = 99; assert.equal(engine.diagnostics.rectangle.dof, 1);
  const held = engine.document.features[0], p = held.points.find(p => p.id === 'p1'); held.constraints.push({ id: 'new-fixed', kind: 'fixed', refs: [{ pointId: p.id }], fixedPosition: p.position });
  await engine.execute({ kind: 'replace-feature', feature: held }); assert.equal(engine.diagnostics.rectangle.dof, 0);
  assert.equal(engine.diagnostics.rectangle.resultCode, 4); assert.deepEqual(engine.diagnostics.rectangle.failedConstraintIds, []);
  assert(engine.diagnostics.rectangle.redundantConstraintIds.includes('h-bottom'));
  const diagnostics = engine.diagnostics; await engine.execute({ kind: 'rename-project', name: 'rename only' }); assert.deepEqual(engine.diagnostics, diagnostics);
  assert(!Object.hasOwn(JSON.parse(serializeProject(engine.document)), 'diagnostics'));
  evidence.push({ id: 'actual-native-dof-history', states: [constrained.diagnostics.rectangle, free.diagnostics.rectangle, engine.diagnostics.rectangle], undoRedoExact: true, metadataPreserved: true, saveExcludesEphemeralDiagnostics: true });
});
test('native conflict preserves document, diagnostics, history, revision and serializable save content', async () => {
  const engine = new ProjectEngine(createEmptyProject(), { recompute: pipeline }); await engine.execute({ kind: 'add-feature', feature: domainRectangle() });
  const before = snapshot(engine), conflict = domainRectangle(); conflict.constraints.push({ id: 'conflict', kind: 'length', refs: [{ entityId: 'bottom' }], value: 50 });
  await assert.rejects(engine.execute({ kind: 'replace-feature', feature: conflict }), e => e.code === 'SOLVER_REJECTED'); assert.deepEqual(snapshot(engine), before);
  evidence.push({ id: 'native-conflict', snapshotExact: true, before });
});
test('empty/reset/deleted sketches have no inferred diagnostic', async () => {
  const engine = new ProjectEngine(createEmptyProject(), { recompute: pipeline }), empty = domainRectangle(); empty.points = []; empty.entities = []; empty.constraints = [];
  await engine.execute({ kind: 'add-feature', feature: empty }); assert.deepEqual(engine.diagnostics, {});
  await engine.execute({ kind: 'replace-feature', feature: domainRectangle() }); assert.equal(engine.diagnostics.rectangle.dof, 0);
  await engine.execute({ kind: 'delete-feature', id: 'rectangle', cascade: false }); assert.deepEqual(engine.diagnostics, {});
  engine.undo(); assert.equal(engine.diagnostics.rectangle.dof, 0); engine.resetEmpty(createEmptyProject()); assert.deepEqual(engine.diagnostics, {});
  evidence.push({ id: 'no-guessed-dof', emptyDeleteResetNoDiagnostics: true });
});
test('a delayed real native result after cancellation cannot publish old diagnostics', async () => {
  let release, started; const entered = new Promise(resolve => started = resolve);
  const engine = new ProjectEngine(createEmptyProject(), { recompute: async (candidate, context) => {
    const actual = await pipeline(candidate, context); started(); await new Promise(resolve => release = resolve); return actual;
  } });
  const pending = engine.execute({ kind: 'add-feature', feature: domainRectangle() }); const rejected = assert.rejects(pending, e => e.code === 'STALE_TRANSACTION');
  await entered; engine.cancelPending(); await engine.execute({ kind: 'rename-project', name: 'new metadata' }); const before = snapshot(engine); release(); await rejected;
  assert.deepEqual(snapshot(engine), before); assert.deepEqual(engine.diagnostics, {}); evidence.push({ id: 'late-real-native', oldResultRefused: true, snapshotExact: true });
});
test('malformed diagnostics refuse the whole candidate after real recomputation', async () => {
  for (const mutate of [d => d.rectangle.dof = 1, d => d.rectangle.residuals.width = NaN, d => delete d.rectangle.residuals.width, d => d.missing = d.rectangle]) {
    const engine = new ProjectEngine(createEmptyProject(), { recompute: async (candidate, context) => { const actual = await pipeline(candidate, context); mutate(actual.diagnostics); return actual; } });
    const before = snapshot(engine); await assert.rejects(engine.execute({ kind: 'add-feature', feature: domainRectangle() }), e => e.code === 'INVALID_DIAGNOSTICS'); assert.deepEqual(snapshot(engine), before);
  }
  evidence.push({ id: 'corrupted-diagnostics', refusals: 4, realNativeBeforeCorruption: true, candidateNeverCommitted: true });
});
after(() => {
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync('docs/learning/evidence/T-201C1-diagnostics.json', JSON.stringify({ task: 'T-201C1', executedAt: new Date().toISOString(), command: 'npm run check:diagnostics', environment: { node: process.version, platform: process.platform, solver: 'unchanged SolveSpace 2879a02d WASM' }, tests: 5, evidence, nativeErrors: errors, passed: evidence.length === 5, limitations: ['This is real Node pipeline evidence; UI/Worker display and full REQ-005 remain C2.', 'Controlled promises only delay real native output; they do not synthesize solution geometry or DOF.'] }, null, 2) + '\n');
});
