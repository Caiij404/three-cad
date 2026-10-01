import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { tangentCurves, tangentLine, runTangentFixtures, runTangentTransaction } from '../src/experiments/tangent-fixtures.ts';
const unit = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/tangency.test.mjs'], { encoding: 'utf8' });
writeFileSync('docs/learning/evidence/T-201B2-tangency.log', unit.stdout + unit.stderr); assert.equal(unit.status, 0, unit.stdout + unit.stderr);
const errors = [], module = await createModule({ printErr: s => errors.push(s) }), solve = async input => solveDomainSketch(module, input);
const fixtures = await runTangentFixtures(solve), transaction = await runTangentTransaction(solve), invalid = [];
for (const [id, mutate] of [
  ['line-line', s => { const c = s.constraints.find(c => c.id === 'relation'); c.refs = [{ entityId: 'curve-b-ray-x' }, { entityId: 'curve-b-ray-y' }]; }],
  ['same-curve', s => s.constraints.find(c => c.id === 'relation').refs[1] = { entityId: 'curve-a' }],
  ['missing-ref', s => s.constraints.find(c => c.id === 'relation').refs[1] = { entityId: 'missing' }],
  ['point-ref', s => s.constraints.find(c => c.id === 'relation').refs[1] = { pointId: 'curve-b-center' }],
  ['concentric-initial', s => s.points.find(p => p.id === 'curve-b-center').position = [0, 0]],
]) { const sketch = tangentCurves('circle', 'arc'); mutate(sketch); let called = false;
  const watched = new Proxy(module, { get(target, key) { if (key === 'clearSketch') return () => { called = true; return target.clearSketch(); }; return target[key]; } });
  assert.throws(() => solveDomainSketch(watched, { sketch })); assert(!called); invalid.push({ id, rejectedBeforeNative: true });
}
// A native conflict must report domain constraint IDs, including any failed auxiliary relation.
const conflict = tangentLine('circle'); for (const id of ['line-start', 'line-end']) conflict.constraints.push({ id: `fixed-${id}`, kind: 'fixed', refs: [{ pointId: id }], fixedPosition: conflict.points.find(p => p.id === id).position });
const failure = solveDomainSketch(module, { sketch: conflict }); assert.equal(failure.sketch, null); assert.equal(failure.status, 'inconsistent'); assert(failure.failedConstraintIds.includes('relation')); assert(failure.failedConstraintIds.every(id => conflict.constraints.some(c => c.id === id)));
assert.equal(errors.length, 0, errors.join('\n'));
writeFileSync('docs/learning/evidence/T-201B2-tangency-native.json', JSON.stringify({ task: 'T-201B2', executedAt: new Date().toISOString(), command: 'npm run check:tangency', environment: { node: process.version, platform: process.platform, solver: 'unchanged SolveSpace 2879a02d WASM' }, unitTests: 4, fixtures, transaction, invalid, conflict: { input: conflict, result: failure }, nativeErrors: errors, passed: true,
  limitations: ['Concentric initial centers are explicitly refused until the user supplies a direction by moving one center.', 'Extreme scales and branch switching during arbitrary dragging are not exhaustively measured; candidate finite range and residual always checked.'] }, null, 2) + '\n');
console.log(`PASS: ${fixtures.cases.length} real tangent cases, ${fixtures.refused.length} finite-range refusals, ${invalid.length} pre-native refusals, auxiliary failure IDs and actual history/rollback.`);
