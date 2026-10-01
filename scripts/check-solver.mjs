import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import createModule from '../public/wasm/slvs.mjs';
import { solveSketch, validateSolverSketch } from '../src/adapters/solver/solve-sketch.ts';
import { rectangle, runSolverFixtures } from '../src/experiments/solver-fixtures.ts';

const errors = [];
const module = await createModule({ printErr: message => errors.push(message) });
const initialHeapBytes = module.HEAPU8.byteLength;
// Native lazy allocation may grow memory on first use; compare equivalent warmed workloads.
await runSolverFixtures(async input => solveSketch(module, input));
const heapBefore = module.HEAPU8.byteLength;
const cases = await runSolverFixtures(async input => solveSketch(module, input));
const heapAfter = module.HEAPU8.byteLength;
const invalidInputs = [];
for (const [id, mutate] of [
  ['non-finite', input => { input.points[1].x = NaN; }],
  ['missing-point', input => { input.lines[0].a = 'missing'; }],
  ['zero-length', input => { input.points[1].x = 0; input.points[1].y = 0; }],
  ['wrong-constraint-object', input => { input.constraints[0].line = 'p0'; }],
  ['duplicate-id', input => { input.points[1].id = 'p0'; }],
]) {
  const input = rectangle(); mutate(input);
  assert.throws(() => validateSolverSketch(input), /INVALID_SKETCH/);
  assert.throws(() => solveSketch(module, input), /INVALID_SKETCH/);
  invalidInputs.push({ id, expected: 'reject before native API', actual: 'INVALID_SKETCH', passed: true });
}
assert.equal(heapBefore, heapAfter, 'An identical warmed fixture batch should not grow the WASM memory buffer');
assert.equal(errors.length, 0, errors.join('\n'));
const artifacts = Object.fromEntries(['slvs.mjs', 'slvs.wasm'].map(name => {
  const bytes = readFileSync(new URL(`../public/wasm/${name}`, import.meta.url));
  return [name, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }];
}));
const evidence = { task: 'T-003', learningUnits: ['L-006A', 'L-006B', 'L-006C'],
  executedAt: new Date().toISOString(), command: 'npm run check:solver',
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  actualSolver: 'SolveSpace 2879a02d + recorded patches, Emscripten 4.0.8', artifacts,
  memory: { initialHeapBytes, heapAfterWarmupBytes: heapBefore, heapAfterRepeatedBatchBytes: heapAfter,
    totalRectangleRepetitions: 60,
    limitation: 'Cold allocation can grow memory; an identical warmed batch is stable. This is not proof of absence of every native allocation leak.' },
  cases, invalidInputs, nativeErrors: errors, passed: true,
  limitations: ['Subset adapter; full P0 constraints and transaction history are future tasks.'] };
writeFileSync(fileURLToPath(new URL('../docs/learning/evidence/T-003-solver-node.json', import.meta.url)), JSON.stringify(evidence, null, 2) + '\n');
console.log(`PASS: ${cases.length} numerical cases, 30 repetitions, ${invalidInputs.length} invalid inputs; WASM memory ${heapAfter} bytes.`);
