import { BASE_PLANES } from '../core/geometry/plane.ts';
import { measureTangency } from '../core/geometry/tangency.ts';
import { createEmptyProject, type Constraint, type Entity, type SketchFeature, type Vec2 } from '../core/model/document.ts';
import { ProjectEngine } from '../core/commands/project-engine.ts';
import { sketchRecompute } from '../app/sketch-recompute.ts';
import type { SketchSolveInput, SketchSolution } from '../core/sketch-solution.ts';
import { domainTangent } from './domain-solver-fixtures.ts';

const fixed = (id: string, position: Vec2): Constraint => ({ id: `fixed-${id}`, kind: 'fixed', refs: [{ pointId: id }], fixedPosition: position });
const base = (id: string): SketchFeature => ({ id, name: id, kind: 'sketch', visible: true, plane: BASE_PLANES.XY, points: [], entities: [], constraints: [] });
function addCurve(sketch: SketchFeature, id: string, kind: 'circle' | 'arc', center: Vec2, radius: number, immobile: boolean, contactRight: boolean, clockwise: boolean) {
  sketch.points.push({ id: `${id}-center`, position: center });
  if (immobile) sketch.constraints.push(fixed(`${id}-center`, center));
  if (kind === 'circle') sketch.entities.push({ id, kind, centerPointId: `${id}-center`, radius });
  else {
    const x: Vec2 = [center[0] + (contactRight ? radius : -radius), center[1]], y: Vec2 = [center[0], center[1] + radius];
    sketch.points.push({ id: `${id}-x`, position: x }, { id: `${id}-y`, position: y });
    const forward = contactRight !== clockwise;
    sketch.entities.push({ id, kind, centerPointId: `${id}-center`, startPointId: `${id}-${forward ? 'x' : 'y'}`, endPointId: `${id}-${forward ? 'y' : 'x'}`, clockwise });
    if (immobile) sketch.constraints.push(fixed(`${id}-x`, x), fixed(`${id}-y`, y));
    else for (const [suffix, direction] of [['x', 'horizontal'], ['y', 'vertical']] as const) {
      sketch.entities.push({ id: `${id}-ray-${suffix}`, kind: 'line', startPointId: `${id}-center`, endPointId: `${id}-${suffix}` });
      sketch.constraints.push({ id: `${id}-direction-${suffix}`, kind: direction, refs: [{ entityId: `${id}-ray-${suffix}` }] });
    }
  }
  if (!immobile || kind === 'circle') sketch.constraints.push({ id: `${id}-radius`, kind: 'radius', refs: [{ entityId: id }], value: radius });
}
export function tangentLine(curve: 'circle' | 'arc', clockwise = false, swapped = false, reverseLine = false): SketchFeature {
  const sketch = base(`line-${curve}-${clockwise}-${swapped}-${reverseLine}`);
  addCurve(sketch, 'curve-a', curve, [0, 0], 10, true, true, clockwise);
  sketch.points.push({ id: 'line-start', position: [-20, 8] }, { id: 'line-end', position: [20, 8] });
  sketch.entities.push({ id: 'line', kind: 'line', startPointId: reverseLine ? 'line-end' : 'line-start', endPointId: reverseLine ? 'line-start' : 'line-end' });
  sketch.constraints.push({ id: 'line-horizontal', kind: 'horizontal', refs: [{ entityId: 'line' }] }, { id: 'line-length', kind: 'length', refs: [{ entityId: 'line' }], value: 40 },
    { id: 'relation', kind: 'tangent', refs: (swapped ? ['line', 'curve-a'] : ['curve-a', 'line']).map(entityId => ({ entityId })) });
  return sketch;
}
export function tangentCurves(a: 'circle' | 'arc', b: 'circle' | 'arc', internal = false, clockwise = false, swapped = false): SketchFeature {
  const sketch = base(`${a}-${b}-${internal}-${clockwise}-${swapped}`);
  addCurve(sketch, 'curve-a', a, [0, 0], 10, true, true, clockwise);
  addCurve(sketch, 'curve-b', b, [internal ? 3 : 19, 0], 8, false, internal, clockwise);
  sketch.entities.push({ id: 'axis', kind: 'line', startPointId: 'curve-a-center', endPointId: 'curve-b-center' });
  sketch.constraints.push({ id: 'axis-horizontal', kind: 'horizontal', refs: [{ entityId: 'axis' }] },
    { id: 'relation', kind: 'tangent', refs: (swapped ? ['curve-b', 'curve-a'] : ['curve-a', 'curve-b']).map(entityId => ({ entityId })) });
  return sketch;
}
export function tangentRangeFailure(kind: 'line-extension' | 'arc-outside', clockwise = false): SketchFeature {
  if (kind === 'line-extension') {
    const sketch = tangentLine('circle');
    sketch.points.find(p => p.id === 'line-start')!.position = [-20, 10];
    sketch.points.find(p => p.id === 'line-end')!.position = [-15, 10];
    sketch.constraints = sketch.constraints.filter(c => !['line-horizontal', 'line-length'].includes(c.id));
    for (const id of ['line-start', 'line-end']) sketch.constraints.push(fixed(id, sketch.points.find(p => p.id === id)!.position));
    return sketch;
  }
  const sketch = tangentCurves('arc', 'circle', false, clockwise);
  sketch.points.find(p => p.id === 'curve-a-x')!.position = [-10, 0];
  sketch.constraints.find(c => c.id === 'fixed-curve-a-x')!.fixedPosition = [-10, 0];
  const arc = sketch.entities.find(e => e.id === 'curve-a')! as Extract<Entity, { kind: 'arc' }>;
  arc.startPointId = clockwise ? 'curve-a-x' : 'curve-a-y'; arc.endPointId = clockwise ? 'curve-a-y' : 'curve-a-x';
  return sketch;
}
export function tangentCases(): SketchFeature[] {
  const cases = [tangentLine('circle'), tangentLine('circle', false, true, true), tangentLine('arc'), tangentLine('arc', true, true, true),
    ...[false, true].flatMap(internal => [tangentCurves('circle', 'circle', internal), tangentCurves('circle', 'circle', internal, false, true),
      tangentCurves('arc', 'circle', internal), tangentCurves('circle', 'arc', internal, true, true),
      tangentCurves('arc', 'arc', internal), tangentCurves('arc', 'arc', internal, true, true)]), domainTangent()];
  return Object.entries(BASE_PLANES).flatMap(([plane, frame]) => cases.map(original => {
    const sketch = structuredClone(original); sketch.id += `-${plane}`; sketch.name = sketch.id; sketch.plane = structuredClone(frame); return sketch;
  }));
}
function require(condition: boolean, message: string): asserts condition { if (!condition) throw new Error(`TANGENT_FIXTURE: ${message}`); }
export async function runTangentFixtures(solve: (input: SketchSolveInput) => Promise<SketchSolution>) {
  const cases = [];
  for (const sketch of tangentCases()) {
    const before = JSON.stringify(sketch), result = await solve({ sketch });
    require(result.sketch !== null, `${sketch.id}: ${result.status}`);
    require(JSON.stringify(sketch) === before, 'input changed');
    const definition = (s: SketchFeature) => ({ points: s.points.map(p => p.id), entities: s.entities.map(e => e.kind === 'circle' ? { ...e, radius: 0 } : e), constraints: s.constraints });
    require(JSON.stringify(definition(sketch)) === JSON.stringify(definition(result.sketch)), 'auxiliary geometry leaked into document');
    for (const error of Object.values(result.residuals)) require(Number.isFinite(error) && error <= 1e-5, `${sketch.id}: residual ${error}`);
    const relation = result.sketch.constraints.find(c => c.kind === 'tangent')!;
    const refs = relation.refs.map(r => result.sketch!.entities.find(e => e.id === ('entityId' in r ? r.entityId : ''))!);
    const measurement = measureTangency(result.sketch, refs[0]!, refs[1]!);
    if (sketch.entities.some(e => e.id === 'curve-b')) {
      const centers = ['curve-a-center', 'curve-b-center'].map(id => result.sketch!.points.find(p => p.id === id)!.position);
      const d = Math.hypot(centers[0]![0] - centers[1]![0], centers[0]![1] - centers[1]![1]);
      const initialCenter = sketch.points.find(p => p.id === 'curve-b-center')!.position;
      require(Math.abs(d - (initialCenter[0] === 3 ? 2 : 18)) <= 1e-5, `${sketch.id}: center distance ${d}`);
    }
    cases.push({ id: sketch.id, input: sketch, result, measurement, expected: 'finite tangent contact, unchanged domain IDs; residual ≤1e-5 mm', passed: true });
  }
  const refused = [];
  for (const [kind, clockwise] of [['line-extension', false], ['arc-outside', false], ['arc-outside', true]] as const) {
    const sketch = tangentRangeFailure(kind, clockwise), before = JSON.stringify(sketch); let code = '', message = '';
    try { await solve({ sketch }); } catch (cause) { if (cause instanceof Error && 'code' in cause) { code = String(cause.code); message = cause.message; } else throw cause; }
    require(code === 'TANGENT_RANGE' && JSON.stringify(sketch) === before, `${kind}: expected unchanged input and TANGENT_RANGE, got ${code}`);
    refused.push({ kind, clockwise, input: sketch, code, message, passed: true });
  }
  return { cases, refused };
}
export async function runTangentTransaction(solve: (input: SketchSolveInput, revision: number) => Promise<SketchSolution>) {
  const engine = new ProjectEngine(createEmptyProject(), { recompute: sketchRecompute(solve) });
  await engine.execute({ kind: 'add-feature', feature: tangentCurves('circle', 'circle') });
  const before = JSON.stringify(engine.document), changed = engine.document.features[0] as SketchFeature;
  changed.constraints.find(c => c.id === 'curve-b-radius')!.value = 12;
  await engine.execute({ kind: 'replace-feature', feature: changed }); const after = JSON.stringify(engine.document);
  const measure = (document = engine.document) => { const sketch = document.features[0] as SketchFeature, a = sketch.points.find(p => p.id === 'curve-a-center')!.position, b = sketch.points.find(p => p.id === 'curve-b-center')!.position; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  const distancesMm = [measure(JSON.parse(before)), measure()];
  engine.undo(); require(JSON.stringify(engine.document) === before, 'undo changed snapshot'); distancesMm.push(measure());
  engine.redo(); require(JSON.stringify(engine.document) === after, 'redo changed snapshot'); distancesMm.push(measure());
  distancesMm.forEach((d, i) => require(Math.abs(d - [18, 22, 18, 22][i]!) <= 1e-5, 'actual center distance history differs'));
  const failures = [];
  const conflict = engine.document.features[0] as SketchFeature;
  conflict.constraints.push({ id: 'center-distance-conflict', kind: 'distance', refs: [{ pointId: 'curve-a-center' }, { pointId: 'curve-b-center' }], value: 20 });
  for (const candidate of [conflict, tangentRangeFailure('line-extension'), tangentRangeFailure('arc-outside')]) {
    if (candidate !== conflict) {
      // A different fixture is new geometry, so give its objects fresh IDs rather than changing an existing ID's role.
      candidate.id = conflict.id;
      const fresh = (id: string) => `range-${id}`;
      for (const p of candidate.points) p.id = fresh(p.id);
      for (const e of candidate.entities) {
        e.id = fresh(e.id);
        if (e.kind !== 'line') e.centerPointId = fresh(e.centerPointId);
        if (e.kind !== 'circle') { e.startPointId = fresh(e.startPointId); e.endPointId = fresh(e.endPointId); }
      }
      for (const c of candidate.constraints) { c.id = fresh(c.id); c.refs = c.refs.map(r => 'pointId' in r ? { pointId: fresh(r.pointId) } : { entityId: fresh(r.entityId) }); }
    }
    const history = engine.historyLength, revision = engine.revision; let code = '', message = '';
    try { await engine.execute({ kind: 'replace-feature', feature: candidate }); } catch (cause) { if (cause instanceof Error && 'code' in cause) { code = String(cause.code); message = cause.message; } else throw cause; }
    require(['SOLVER_REJECTED', 'TANGENT_RANGE'].includes(code), `expected real failure, got ${code}`);
    require(JSON.stringify(engine.document) === after && engine.historyLength === history && engine.revision === revision, 'failure changed committed state');
    failures.push({ code, message, documentHistoryRevisionUnchanged: true });
  }
  return { distancesMm, before: JSON.parse(before), after: JSON.parse(after), failures, undoRedoExact: true, toleranceMm: 1e-5, passed: true };
}
