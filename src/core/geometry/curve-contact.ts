import type { Entity, SketchFeature, Vec2 } from '../model/document.ts';
import { DomainError } from '../model/document.ts';

export const CONTOUR_TOLERANCE_MM = 1e-6;
export const TAU = 2 * Math.PI;
export const positiveAngle = (a: number) => ((a % TAU) + TAU) % TAU;
export const distance2D = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

export type BoundaryCurve =
  | { id: string; kind: 'line'; a: Vec2; b: Vec2 }
  | { id: string; kind: 'circle' | 'arc'; center: Vec2; radius: number; start: number; sweep: number;
      a?: Vec2; b?: Vec2; endpointErrorMm: number };
export interface CurveContact { points: Vec2[]; overlap: boolean }

/** Caller first validates drawable/solved geometry through sampleSketchEntity. */
export function boundaryCurve(sketch: SketchFeature, entity: Entity): BoundaryCurve {
  const points = new Map(sketch.points.map(p => [p.id, p.position]));
  const point = (id: string) => {
    const p = points.get(id);
    if (!p) throw new DomainError('REFERENCE_MISSING', `轮廓缺少点 ${id}`);
    return [...p] as Vec2;
  };
  if (entity.kind === 'line') return { id: entity.id, kind: 'line', a: point(entity.startPointId), b: point(entity.endPointId) };
  const center = point(entity.centerPointId);
  if (entity.kind === 'circle') return { id: entity.id, kind: 'circle', center, radius: entity.radius, start: 0, sweep: TAU, endpointErrorMm: 0 };
  const a = point(entity.startPointId), b = point(entity.endPointId);
  const radius = distance2D(a, center), start = Math.atan2(a[1] - center[1], a[0] - center[0]);
  const end = Math.atan2(b[1] - center[1], b[0] - center[0]);
  return { id: entity.id, kind: 'arc', center, radius, start,
    sweep: entity.clockwise ? -positiveAngle(start - end) : positiveAngle(end - start), a, b,
    endpointErrorMm: Math.abs(distance2D(b, center) - radius) };
}

export function angleOnCurve(curve: Exclude<BoundaryCurve, { kind: 'line' }>, angle: number, toleranceMm = CONTOUR_TOLERANCE_MM): boolean {
  if (curve.kind === 'circle') return true;
  const offset = positiveAngle(Math.sign(curve.sweep) * (angle - curve.start)), tolerance = toleranceMm / curve.radius;
  return offset <= Math.abs(curve.sweep) + tolerance || TAU - offset <= tolerance;
}
export function pointOnBoundary(curve: BoundaryCurve, p: Vec2, toleranceMm = CONTOUR_TOLERANCE_MM): boolean {
  if (curve.kind !== 'line') return Math.abs(distance2D(p, curve.center) - curve.radius) <= toleranceMm + curve.endpointErrorMm
    && angleOnCurve(curve, Math.atan2(p[1] - curve.center[1], p[0] - curve.center[0]), toleranceMm);
  const ab = sub(curve.b, curve.a), ap = sub(p, curve.a), length = Math.hypot(...ab), t = dot(ap, ab) / (length * length);
  return t >= -toleranceMm / length && t <= 1 + toleranceMm / length && Math.abs(cross(ab, ap)) / length <= toleranceMm;
}

/** Finite analytic contacts, including near contacts within the closure tolerance. */
export function curveContacts(a: BoundaryCurve, b: BoundaryCurve, toleranceMm = CONTOUR_TOLERANCE_MM): CurveContact {
  const points: Vec2[] = []; let overlap = false;
  const add = (p: Vec2) => {
    if (pointOnBoundary(a, p, toleranceMm) && pointOnBoundary(b, p, toleranceMm) && !points.some(q => distance2D(p, q) <= toleranceMm)) points.push(p);
  };
  if (a.kind === 'line' && b.kind === 'line') {
    const u = sub(a.b, a.a), v = sub(b.b, b.a), w = sub(b.a, a.a), lu = Math.hypot(...u), lv = Math.hypot(...v), den = cross(u, v);
    if (Math.abs(den) > 1e-12 * lu * lv) {
      const t = cross(w, v) / den, s = cross(w, u) / den;
      if (t >= -toleranceMm / lu && t <= 1 + toleranceMm / lu && s >= -toleranceMm / lv && s <= 1 + toleranceMm / lv)
        add([a.a[0] + t * u[0], a.a[1] + t * u[1]]);
    } else if (Math.abs(cross(w, u)) / lu <= toleranceMm) {
      const t0 = dot(w, u) / (lu * lu), t1 = dot(sub(b.b, a.a), u) / (lu * lu);
      const low = Math.max(0, Math.min(t0, t1)), high = Math.min(1, Math.max(t0, t1));
      overlap = (high - low) * lu > toleranceMm;
      if (high >= low - toleranceMm / lu) add([a.a[0] + (low + high) / 2 * u[0], a.a[1] + (low + high) / 2 * u[1]]);
    }
  } else if (a.kind === 'line' || b.kind === 'line') {
    const line = (a.kind === 'line' ? a : b) as Extract<BoundaryCurve, { kind: 'line' }>;
    const curve = (a.kind === 'line' ? b : a) as Exclude<BoundaryCurve, { kind: 'line' }>;
    const u = sub(line.b, line.a), length = Math.hypot(...u), t = dot(sub(curve.center, line.a), u) / (length * length);
    const foot: Vec2 = [line.a[0] + t * u[0], line.a[1] + t * u[1]], d = distance2D(foot, curve.center);
    if (d <= curve.radius + toleranceMm + curve.endpointErrorMm) {
      const dt = Math.sqrt(Math.max(0, (curve.radius - d) * (curve.radius + d))) / length;
      for (const s of [t - dt, t + dt]) if (s >= -toleranceMm / length && s <= 1 + toleranceMm / length)
        add([line.a[0] + s * u[0], line.a[1] + s * u[1]]);
    }
  } else {
    const d = distance2D(a.center, b.center), radiusDifference = Math.abs(a.radius - b.radius);
    if (d <= toleranceMm && radiusDifference <= toleranceMm) {
      // Partition co-circular arcs at all endpoints; shared endpoints alone are legal.
      const cuts = [...new Set([0, a.start, a.start + a.sweep, b.start, b.start + b.sweep].map(positiveAngle))].sort((x, y) => x - y);
      for (let i = 0; i < cuts.length; i++) {
        const from = cuts[i]!, to = i + 1 === cuts.length ? cuts[0]! + TAU : cuts[i + 1]!, mid = (from + to) / 2;
        if ((to - from) * Math.min(a.radius, b.radius) > toleranceMm && angleOnCurve(a, mid, 0) && angleOnCurve(b, mid, 0)) overlap = true;
        add([a.center[0] + a.radius * Math.cos(from), a.center[1] + a.radius * Math.sin(from)]);
      }
    } else if (d > 0 && d <= a.radius + b.radius + toleranceMm && d >= radiusDifference - toleranceMm) {
      const x = ((a.radius - b.radius) * (a.radius + b.radius) + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, (a.radius - x) * (a.radius + x))), ux = (b.center[0] - a.center[0]) / d, uy = (b.center[1] - a.center[1]) / d;
      for (const sign of [-1, 1]) add([a.center[0] + x * ux - sign * h * uy, a.center[1] + x * uy + sign * h * ux]);
    }
  }
  for (const p of [a.a, a.b, b.a, b.b]) if (p) add(p);
  return { points, overlap };
}

/** Ray direction avoids every endpoint and circular tangency before counting crossings. */
export function insideAnalyticLoop(point: Vec2, curves: BoundaryCurve[]): boolean {
  for (let attempt = 0; attempt < 64; attempt++) {
    const angle = attempt * 2.399963229728653, ux = Math.cos(angle), uy = Math.sin(angle);
    const project = (p: Vec2): Vec2 => { const d = sub(p, point); return [d[0] * ux + d[1] * uy, -d[0] * uy + d[1] * ux]; };
    const ambiguous = curves.some(curve => {
      if ([curve.a, curve.b].some(p => p && Math.abs(project(p)[1]) <= 1e-10)) return true;
      return curve.kind !== 'line' && Math.abs(Math.abs(project(curve.center)[1]) - curve.radius) <= 1e-10;
    });
    if (ambiguous) continue;
    let crossings = 0;
    for (const curve of curves) {
      if (curve.kind === 'line') {
        const a = project(curve.a), b = project(curve.b);
        if ((a[1] > 0) !== (b[1] > 0) && a[0] + (b[0] - a[0]) * (-a[1]) / (b[1] - a[1]) > 0) crossings++;
      } else {
        const center = project(curve.center), y = -center[1];
        if (Math.abs(y) >= curve.radius) continue;
        const dx = Math.sqrt((curve.radius - Math.abs(y)) * (curve.radius + Math.abs(y)));
        for (const x of [center[0] - dx, center[0] + dx]) {
          const worldAngle = angle + Math.atan2(y, x - center[0]);
          if (x > 0 && angleOnCurve(curve, worldAngle, 0)) crossings++;
        }
      }
    }
    return crossings % 2 === 1;
  }
  throw new DomainError('CONTOUR_CLASSIFICATION_AMBIGUOUS', '包含关系射线过于接近端点或切点，请调整轮廓');
}
