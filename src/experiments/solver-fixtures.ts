import type { SolverResult, SolverSketch } from '../core/solver-types.ts';

export function rectangle(width = 40, height = 30): SolverSketch {
  return {
    points: [{ id: 'p0', x: 0, y: 0, fixed: true }, { id: 'p1', x: 32, y: 0.5 },
      { id: 'p2', x: 33, y: 24 }, { id: 'p3', x: 0.2, y: 23 }],
    lines: [{ id: 'bottom', a: 'p0', b: 'p1' }, { id: 'right', a: 'p1', b: 'p2' },
      { id: 'top', a: 'p2', b: 'p3' }, { id: 'left', a: 'p3', b: 'p0' }], arcs: [],
    constraints: [{ id: 'h-bottom', kind: 'horizontal', line: 'bottom' },
      { id: 'v-right', kind: 'vertical', line: 'right' }, { id: 'h-top', kind: 'horizontal', line: 'top' },
      { id: 'v-left', kind: 'vertical', line: 'left' }, { id: 'width', kind: 'length', line: 'bottom', value: width },
      { id: 'height', kind: 'length', line: 'left', value: height }],
  };
}

export function tangentArc(): SolverSketch {
  return {
    points: [{ id: 'center', x: 0, y: 0, fixed: true }, { id: 'start', x: 10, y: 0, fixed: true },
      { id: 'end', x: 0.5, y: 8 }, { id: 'line-end', x: 18, y: 8.5 }],
    lines: [{ id: 'tangent', a: 'end', b: 'line-end' }],
    arcs: [{ id: 'arc', center: 'center', start: 'start', end: 'end' }],
    constraints: [{ id: 'line-horizontal', kind: 'horizontal', line: 'tangent' },
      { id: 'arc-line-tangent', kind: 'tangent', arc: 'arc', line: 'tangent' },
      { id: 'line-length', kind: 'length', line: 'tangent', value: 20 }],
  };
}

export interface SolverCaseEvidence {
  id: string; expected: string; result: SolverResult;
  residuals: Record<string, number>; tolerance: { lengthMm: number; tangentDot: number }; passed: true;
}
const lengthTolerance = 1e-5;
function require(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`SOLVER_FIXTURE: ${message}`);
}
function rectangleResiduals(result: SolverResult, width: number, height: number): Record<string, number> {
  require(result.points !== null, 'successful rectangle has no coordinates');
  const p = Object.fromEntries(result.points.map(point => [point.id, point]));
  return { widthMm: Math.abs(Math.hypot(p.p1!.x - p.p0!.x, p.p1!.y - p.p0!.y) - width),
    heightMm: Math.abs(Math.hypot(p.p3!.x - p.p0!.x, p.p3!.y - p.p0!.y) - height),
    horizontalMm: Math.max(Math.abs(p.p1!.y - p.p0!.y), Math.abs(p.p2!.y - p.p3!.y)),
    verticalMm: Math.max(Math.abs(p.p1!.x - p.p2!.x), Math.abs(p.p3!.x - p.p0!.x)),
    fixedOriginMm: Math.hypot(p.p0!.x, p.p0!.y) };
}

export async function runSolverFixtures(solve: (input: SolverSketch) => Promise<SolverResult>): Promise<SolverCaseEvidence[]> {
  const cases: SolverCaseEvidence[] = [];
  const add = (id: string, expected: string, result: SolverResult, residuals: Record<string, number>) => {
    for (const [name, value] of Object.entries(residuals)) {
      require(Number.isFinite(value) && value <= (name === 'tangentDot' ? 1e-5 : lengthTolerance), `${id}/${name} = ${value}`);
    }
    cases.push({ id, expected, result, residuals, tolerance: { lengthMm: lengthTolerance, tangentDot: 1e-5 }, passed: true });
  };
  for (const width of [40, 60, 40.123456789, 9999.0001]) {
    const result = await solve(rectangle(width));
    require(result.status === 'fully-constrained' && result.dof === 0, `rectangle ${width}: ${result.status}, DOF ${result.dof}`);
    add(`rectangle-${width}`, `width ${width} mm, height 30 mm, DOF 0`, result, rectangleResiduals(result, width, 30));
  }
  const conflict = rectangle();
  conflict.constraints.push({ id: 'conflicting-width', kind: 'length', line: 'bottom', value: 50 });
  const unchanged = JSON.stringify(conflict);
  const failure = await solve(conflict);
  require(failure.status === 'inconsistent' && failure.points === null && failure.failedConstraintIds.length > 0, 'conflicting dimensions must return real failure IDs and no geometry');
  require(JSON.stringify(conflict) === unchanged, 'solver mutated conflict input');
  add('conflicting-40-50', 'inconsistent, conflict IDs, no candidate geometry', failure, {});
  const free = rectangle();
  free.constraints = free.constraints.filter(c => c.id !== 'width');
  const under = await solve(free);
  require(under.status === 'under-constrained' && under.dof === 1, `width removed: expected DOF 1, got ${under.dof}`);
  add('width-removed', 'under-constrained, real DOF 1', under, {});
  const arc = await solve(tangentArc());
  require(arc.status === 'fully-constrained' && arc.dof === 0 && arc.points !== null, 'arc/tangent must solve with DOF 0');
  const p = Object.fromEntries(arc.points.map(point => [point.id, point]));
  const radial = [p.end!.x - p.center!.x, p.end!.y - p.center!.y];
  const direction = [p['line-end']!.x - p.end!.x, p['line-end']!.y - p.end!.y];
  const dot = Math.abs(radial[0]! * direction[0]! + radial[1]! * direction[1]!) / (Math.hypot(...radial) * Math.hypot(...direction));
  add('arc-tangent', 'radius 10 mm, horizontal tangent length 20 mm, DOF 0', arc,
    { radiusMm: Math.abs(Math.hypot(...radial) - 10), lineLengthMm: Math.abs(Math.hypot(...direction) - 20),
      horizontalMm: Math.abs(direction[1]!), tangentDot: dot });
  for (let i = 0; i < 30; i++) {
    const result = await solve(rectangle(i % 2 ? 60 : 40));
    require(result.dof === 0 && result.status === 'fully-constrained', 'repeated solve corrupted status');
    const residuals = rectangleResiduals(result, i % 2 ? 60 : 40, 30);
    for (const value of Object.values(residuals)) require(value <= lengthTolerance, 'repeated solve corrupted coordinates');
    if (i === 29) add('repeat-30', '30 alternating 40/60 mm solves after conflict and arc', result, residuals);
  }
  return cases;
}
