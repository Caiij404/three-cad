import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureTangency, tangentContactGuess } from '../src/core/geometry/tangency.ts';
import { tangentLine, tangentCurves } from '../src/experiments/tangent-fixtures.ts';
const refs = s => s.constraints.find(c => c.id === 'relation').refs.map(r => s.entities.find(e => e.id === r.entityId));
test('segment parameter tolerance is converted from mm to segment length, in both endpoint directions', () => {
  for (const reverse of [false, true]) for (const gap of [5e-6, 2e-5]) {
    const sketch = tangentLine('circle', false, false, reverse);
    sketch.points.find(p => p.id === 'line-start').position = [gap, 10]; sketch.points.find(p => p.id === 'line-end').position = [20, 10];
    const pair = refs(sketch);
    if (gap < 1e-5) assert(measureTangency(sketch, ...pair).residualMm <= 1e-5);
    else assert.throws(() => measureTangency(sketch, ...pair), e => e.code === 'TANGENT_RANGE');
  }
});
test('arc endpoint wrap accepts only offsets within mm/radius tolerance, for CW and CCW', () => {
  for (const clockwise of [false, true]) for (const gapMm of [5e-6, 2e-5]) {
    const sketch = tangentLine('arc', clockwise), arc = sketch.entities.find(e => e.kind === 'arc');
    const top = sketch.points.find(p => p.id === 'curve-a-y'), angle = Math.PI / 2 - gapMm / 10;
    top.position = [10 * Math.cos(angle), 10 * Math.sin(angle)];
    sketch.points.find(p => p.id === 'line-start').position = [-20, 10]; sketch.points.find(p => p.id === 'line-end').position = [20, 10];
    assert(arc); const pair = refs(sketch);
    if (gapMm < 1e-5) assert(measureTangency(sketch, ...pair).residualMm <= 1e-5);
    else assert.throws(() => measureTangency(sketch, ...pair), e => e.code === 'TANGENT_RANGE');
  }
});
test('support circles can be internally tangent with either reference order; coincident circles are not isolated contacts', () => {
  const sketch = tangentCurves('circle', 'circle', true); sketch.points.find(p => p.id === 'curve-b-center').position = [2, 0];
  const pair = refs(sketch); assert.deepEqual(measureTangency(sketch, ...pair).contact, [10, 0]);
  assert.deepEqual(measureTangency(sketch, ...pair.toReversed()).contact, [10, 0]);
  sketch.points.find(p => p.id === 'curve-b-center').position = [0, 0]; pair[1].radius = 10;
  assert.throws(() => measureTangency(sketch, ...pair), e => e.code === 'TANGENT_DEGENERATE');
});
test('a line through the center has a deterministic nonzero initial radial guess, which is not a solved residual', () => {
  const sketch = tangentLine('circle'); for (const id of ['line-start', 'line-end']) sketch.points.find(p => p.id === id).position[1] = 0;
  const pair = refs(sketch); assert.deepEqual(tangentContactGuess(sketch, ...pair), [0, 10]);
  assert.equal(measureTangency(sketch, ...pair).residualMm, 10);
});
