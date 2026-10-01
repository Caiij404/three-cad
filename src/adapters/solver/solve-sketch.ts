import type { SolverResult, SolverSketch } from '../../core/solver-types.ts';
import type { SlvsEntity, SlvsModule } from './slvs-types.ts';

export function validateSolverSketch(input: SolverSketch): void {
  if (!input || !Array.isArray(input.points) || !Array.isArray(input.lines)
      || !Array.isArray(input.arcs) || !Array.isArray(input.constraints)) throw new Error('INVALID_SKETCH: missing arrays');
  if (input.points.length + input.lines.length + input.arcs.length + input.constraints.length > 2000) {
    throw new Error('INVALID_SKETCH: spike capacity is 2000 items');
  }
  const ids = new Set<string>();
  for (const item of [...input.points, ...input.lines, ...input.arcs, ...input.constraints]) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('INVALID_SKETCH: duplicate or missing ID');
    ids.add(item.id);
  }
  const points = new Map(input.points.map(point => [point.id, point]));
  const lines = new Map(input.lines.map(line => [line.id, line]));
  const arcs = new Map(input.arcs.map(arc => [arc.id, arc]));
  const point = (id: string) => {
    const value = points.get(id);
    if (!value) throw new Error(`INVALID_SKETCH: missing point ${id}`);
    return value;
  };
  for (const p of input.points) {
    if (![p.x, p.y].every(n => Number.isFinite(n) && Math.abs(n) <= 10000)) throw new Error('INVALID_SKETCH: coordinates outside finite ±10000 mm');
    if (p.fixed !== undefined && typeof p.fixed !== 'boolean') throw new Error('INVALID_SKETCH: fixed must be boolean');
  }
  for (const line of input.lines) {
    const a = point(line.a), b = point(line.b);
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) throw new Error('INVALID_SKETCH: zero-length line');
  }
  for (const arc of input.arcs) {
    const c = point(arc.center), a = point(arc.start), b = point(arc.end);
    if (Math.min(Math.hypot(a.x - c.x, a.y - c.y), Math.hypot(b.x - c.x, b.y - c.y), Math.hypot(a.x - b.x, a.y - b.y)) < 1e-6) {
      throw new Error('INVALID_SKETCH: degenerate arc');
    }
  }
  for (const constraint of input.constraints) {
    switch (constraint.kind) {
      case 'length': case 'horizontal': case 'vertical':
        if (!lines.has(constraint.line)) throw new Error('INVALID_SKETCH: constraint requires a line');
        break;
      case 'radius':
        if (!arcs.has(constraint.arc)) throw new Error('INVALID_SKETCH: radius requires an arc');
        break;
      case 'tangent': {
        const arc = arcs.get(constraint.arc), line = lines.get(constraint.line);
        if (!arc || !line || ![arc.start, arc.end].some(id => id === line.a || id === line.b)) {
          throw new Error('INVALID_SKETCH: tangent requires an arc and line sharing an endpoint');
        }
        break;
      }
      default: throw new Error('INVALID_SKETCH: unsupported constraint');
    }
    if ((constraint.kind === 'length' || constraint.kind === 'radius')
        && !(Number.isFinite(constraint.value) && constraint.value > 0 && constraint.value <= 10000)) {
      throw new Error('INVALID_SKETCH: dimension outside (0, 10000] mm');
    }
  }
}

export function solveSketch(module: SlvsModule, input: SolverSketch): SolverResult {
  validateSolverSketch(input); // Reject unsafe native API arguments before calling C++.
  module.clearSketch();
  try {
    const plane = module.addBase2D(1);
    const normal = module.addNormal3D(1, 1, 0, 0, 0);
    const points = new Map<string, SlvsEntity>();
    const lines = new Map<string, SlvsEntity>();
    const arcs = new Map<string, SlvsEntity>();
    const handles = new Map<number, string>();
    const getPoint = (id: string) => points.get(id)!;
    for (const point of input.points) {
      points.set(point.id, module.addPoint2D(point.fixed ? 1 : 2, point.x, point.y, plane));
    }
    for (const line of input.lines) lines.set(line.id, module.addLine2D(2, getPoint(line.a), getPoint(line.b), plane));
    for (const arc of input.arcs) {
      arcs.set(arc.id, module.addArc(2, normal, getPoint(arc.center), getPoint(arc.start), getPoint(arc.end), plane));
    }
    for (const constraint of input.constraints) {
      let handle: number;
      switch (constraint.kind) {
        case 'horizontal': handle = module.horizontal(2, lines.get(constraint.line)!, plane, module.E_NONE).h; break;
        case 'vertical': handle = module.vertical(2, lines.get(constraint.line)!, plane, module.E_NONE).h; break;
        case 'length': {
          const line = input.lines.find(value => value.id === constraint.line)!;
          handle = module.distance(2, getPoint(line.a), getPoint(line.b), constraint.value, plane).h;
          break;
        }
        case 'radius': handle = module.diameter(2, arcs.get(constraint.arc)!, constraint.value * 2).h; break;
        case 'tangent': handle = module.tangent(2, arcs.get(constraint.arc)!, lines.get(constraint.line)!, plane).h; break;
      }
      handles.set(handle, constraint.id);
    }
    const raw = module.solveSketch(2, true);
    const accepted = raw.result === module.RESULT_OKAY || raw.result === module.RESULT_REDUNDANT_OKAY;
    const failedConstraintIds = Array.from(raw.bad ?? [], handle => {
      const id = handles.get(handle);
      if (!id) throw new Error(`SOLVER_PROTOCOL: unknown failed constraint handle ${handle}`);
      return id;
    });
    if (raw.nbad !== failedConstraintIds.length || !Number.isInteger(raw.dof)) throw new Error('SOLVER_PROTOCOL: invalid failure list or DOF');
    const solvedPoints = accepted ? input.points.map(point => {
      const entity = getPoint(point.id);
      const x = module.getParamValue(entity.param[0]), y = module.getParamValue(entity.param[1]);
      if (![x, y].every(Number.isFinite)) throw new Error('SOLVER_NONFINITE: output is not finite');
      return { ...point, x, y };
    }) : null;
    return { status: accepted ? (raw.dof === 0 ? 'fully-constrained' : 'under-constrained')
      : raw.result === module.RESULT_INCONSISTENT ? 'inconsistent' : 'solver-failed',
    resultCode: raw.result, dof: raw.dof, failedConstraintIds, points: solvedPoints };
  } finally {
    module.clearSketch(); // Handles are invalid after this boundary; only plain values escape.
  }
}
