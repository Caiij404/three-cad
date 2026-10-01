import { DomainError, type Entity, type SketchFeature, type Vec2 } from '../model/document.ts';

type Curve = Exclude<Entity, { kind: 'line' }>;
const tau = 2 * Math.PI;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const positiveAngle = (angle: number) => ((angle % tau) + tau) % tau;
function geometry(sketch: SketchFeature) {
  const points = new Map(sketch.points.map(p => [p.id, p.position]));
  const point = (id: string) => points.get(id)!;
  const curve = (entity: Curve) => ({ center: point(entity.centerPointId), radius: entity.kind === 'circle'
    ? entity.radius : distance(point(entity.centerPointId), point(entity.startPointId)) });
  return { point, curve };
}
function projection(point: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  if (length <= 1e-6) throw new DomainError('DEGENERATE_GEOMETRY', '相切需要非零线段');
  const parameter = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (length * length);
  return { contact: [a[0] + parameter * dx, a[1] + parameter * dy] as Vec2, parameter, length, dx, dy };
}
/** A deterministic starting value only; the adapter must still execute native equations. */
export function tangentContactGuess(sketch: SketchFeature, a: Entity, b: Entity): Vec2 {
  const { point, curve } = geometry(sketch);
  const line = a.kind === 'line' ? a : b.kind === 'line' ? b : undefined;
  if (line) {
    const other = a.kind === 'line' ? b : a;
    if (other.kind === 'line') throw new DomainError('REFERENCE_TYPE', '两条直线不能添加相切');
    const { center, radius } = curve(other), projected = projection(center, point(line.startPointId), point(line.endPointId));
    return distance(center, projected.contact) > 1e-6 ? projected.contact
      : [center[0] - projected.dy * radius / projected.length, center[1] + projected.dx * radius / projected.length];
  }
  const ca = curve(a as Curve), cb = curve(b as Curve), d = distance(ca.center, cb.center);
  if (d <= 1e-6) throw new DomainError('TANGENT_INITIAL_POSITION', '共心曲线没有确定的相切初始方向，请先移动圆心');
  const internal = Math.abs(d - Math.abs(ca.radius - cb.radius)) < Math.abs(d - ca.radius - cb.radius);
  const sign = internal && ca.radius < cb.radius ? -1 : 1;
  return [ca.center[0] + sign * ca.radius * (cb.center[0] - ca.center[0]) / d,
    ca.center[1] + sign * ca.radius * (cb.center[1] - ca.center[1]) / d];
}
export interface TangentMeasurement { contact: Vec2; residualMm: number; lineParameter?: number }
/** Independent check from solved domain doubles, never from a native auxiliary point. */
export function measureTangency(sketch: SketchFeature, a: Entity, b: Entity, toleranceMm = 1e-5): TangentMeasurement {
  const { point, curve } = geometry(sketch);
  const inArc = (entity: Entity, contact: Vec2) => {
    if (entity.kind !== 'arc') return;
    const { center, radius } = curve(entity), start = point(entity.startPointId), end = point(entity.endPointId);
    const angle = (p: Vec2) => Math.atan2(p[1] - center[1], p[0] - center[0]);
    const direction = entity.clockwise ? -1 : 1;
    const sweep = positiveAngle(direction * (angle(end) - angle(start)));
    const offset = positiveAngle(direction * (angle(contact) - angle(start))), angularTolerance = toleranceMm / radius;
    if (offset > sweep + angularTolerance && tau - offset > angularTolerance)
      throw new DomainError('TANGENT_RANGE', `${entity.id} 的接触点不在圆弧范围内`);
  };
  const line = a.kind === 'line' ? a : b.kind === 'line' ? b : undefined;
  if (line) {
    const other = a.kind === 'line' ? b : a;
    if (other.kind === 'line') throw new DomainError('REFERENCE_TYPE', '两条直线不能相切');
    const { center, radius } = curve(other), projected = projection(center, point(line.startPointId), point(line.endPointId));
    if (projected.parameter < -toleranceMm / projected.length || projected.parameter > 1 + toleranceMm / projected.length)
      throw new DomainError('TANGENT_RANGE', `${line.id} 的接触点在线段延长线上`);
    inArc(other, projected.contact);
    return { contact: projected.contact, residualMm: Math.abs(distance(center, projected.contact) - radius), lineParameter: projected.parameter };
  }
  const ca = curve(a as Curve), cb = curve(b as Curve), d = distance(ca.center, cb.center);
  if (d <= 1e-6) throw new DomainError('TANGENT_DEGENERATE', '共心曲线没有孤立相切点');
  const candidates = [1, -1].map(sign => {
    const contact: Vec2 = [ca.center[0] + sign * ca.radius * (cb.center[0] - ca.center[0]) / d,
      ca.center[1] + sign * ca.radius * (cb.center[1] - ca.center[1]) / d];
    return { contact, residualMm: Math.abs(distance(contact, cb.center) - cb.radius) };
  }).sort((x, y) => x.residualMm - y.residualMm);
  const result = candidates[0]!;
  inArc(a, result.contact); inArc(b, result.contact);
  return result;
}
