import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { addSketchConstraint, editSketchConstraint, removeSketchConstraint, sketchDimensionLabels } from '../src/core/geometry/constraint-edit.ts';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { domainCircle, domainCoincident, domainRectangle } from '../src/experiments/domain-solver-fixtures.ts';
import { linePair } from '../src/experiments/linear-constraint-fixtures.ts';
import { tangentLine } from '../src/experiments/tangent-fixtures.ts';
const errors = [], module = await createModule({ printErr: s => errors.push(s) }), cases = [], invalid = [];
for (const kind of ['coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'distance', 'length', 'angle', 'radius', 'equal', 'tangent', 'fixed']) {
  let sketch, ids, value;
  if (['parallel', 'perpendicular', 'angle', 'equal'].includes(kind)) { sketch = linePair(kind); sketch.constraints = sketch.constraints.filter(c => c.id !== 'relation'); ids = ['line-a', 'line-b']; if (kind === 'angle') value = Math.PI / 3; }
  else if (kind === 'tangent') { sketch = tangentLine('circle'); sketch.constraints = sketch.constraints.filter(c => c.id !== 'relation'); ids = ['curve-a', 'line']; }
  else if (kind === 'radius') { sketch = domainCircle(); sketch.constraints = sketch.constraints.filter(c => c.kind !== 'radius'); ids = ['circle']; value = 10; }
  else { sketch = domainCoincident(); sketch.constraints = [];
    if (['coincident', 'distance', 'fixed'].includes(kind)) { sketch.entities = []; sketch.points = sketch.points.slice(0, 2); ids = kind === 'fixed' ? ['a'] : ['a', 'b']; if (kind === 'distance') value = 10; }
    else { sketch.entities = sketch.entities.slice(0, 1); sketch.points = sketch.points.slice(0, 2); ids = ['line-a']; if (kind === 'length') value = 10; }
  }
  const before = JSON.stringify(sketch), candidate = addSketchConstraint(sketch, kind, ids, value, `added-${kind}`), result = solveDomainSketch(module, { sketch: candidate });
  assert(result.sketch); assert.equal(JSON.stringify(sketch), before); assert(Object.values(result.residuals).every(v => v <= 1e-5));
  assert.deepEqual(result.sketch.constraints.find(c => c.id === `added-${kind}`), candidate.constraints.at(-1));
  cases.push({ kind, input: candidate, result, labels: sketchDimensionLabels(result.sketch), passed: true });
  const wrong = kind === 'fixed' || kind === 'coincident' || kind === 'distance' ? ['bottom'] : kind === 'tangent' ? ['bottom', 'right'] : kind === 'equal' ? ['bottom', 'bad-circle'] : ['p0'];
  const illegal = domainRectangle(); illegal.entities.push({ id: 'bad-circle', kind: 'circle', centerPointId: 'p0', radius: 10 });
  assert.throws(() => addSketchConstraint(illegal, kind, wrong, value ?? 10, `illegal-${kind}`)); invalid.push({ kind, refs: wrong, rejectedBeforeNative: true });
}
const initial = solveDomainSketch(module, { sketch: domainRectangle() }).sketch, before = JSON.stringify(initial);
const changed = editSketchConstraint(initial, 'width', { value: 60 }), result = solveDomainSketch(module, { sketch: changed });
assert(result.sketch); const labels = sketchDimensionLabels(result.sketch); assert.equal(labels.find(l => l.id === 'width').text, 'L 60.000 mm');
assert.equal(JSON.stringify(initial), before); assert.deepEqual(changed.entities, initial.entities);
const free = solveDomainSketch(module, { sketch: removeSketchConstraint(result.sketch, 'width') }); assert.equal(free.dof, 1); assert(!sketchDimensionLabels(free.sketch).some(l => l.id === 'width'));
const fixedChanged = editSketchConstraint(initial, 'base-fixed', { fixedPosition: [5, 3] }), fixedResult = solveDomainSketch(module, { sketch: fixedChanged }); assert(fixedResult.sketch); assert.deepEqual(fixedResult.sketch.points[0].position, [5, 3]);
for (const update of [{ value: NaN }, { value: -1 }, { value: 0 }]) assert.throws(() => editSketchConstraint(initial, 'width', update));
assert.throws(() => editSketchConstraint(initial, 'h-bottom', { value: 10 })); assert.throws(() => removeSketchConstraint(initial, 'missing'));
assert.equal(errors.length, 0, errors.join('\n'));
writeFileSync('docs/learning/evidence/T-201C2-constraint-native.json', JSON.stringify({ task: 'T-201C2', executedAt: new Date().toISOString(), command: 'npm run check:constraint-edit', environment: { node: process.version, platform: process.platform, solver: 'unchanged SolveSpace 2879a02d WASM' }, cases, invalid, edits: { width: result, labels, removal: free, fixedCoordinates: fixedResult, originalInputUnchanged: true, stableEntities: true, invalidEdits: 5 }, nativeErrors: errors, passed: true, limitations: ['This file covers core editing plus real native; actual panel and gesture acceptance are browser evidence.'] }, null, 2) + '\n');
console.log('PASS: all 12 constraint edits with actual native results and illegal combinations, width/fixed edits, removal DOF and geometry labels.');
