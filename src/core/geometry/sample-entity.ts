import { DomainError, type Entity, type SketchFeature, type Vec2 } from '../model/document.ts';
import { toWorld } from './plane.ts';

export interface CurveSamplingOptions { chordErrorMm?: number; maxStepDegrees?: number }
export interface SampledEntity {
  entityId: string; kind: Entity['kind']; points: Vec2[]; closed: boolean;
  segmentCount: number; sweepRadians: number; maxStepRadians: number; chordErrorBoundMm: number;
}
export const CURVE_SEGMENT_LIMIT = 4096;
const tau = 2 * Math.PI, positive = (angle: number) => ((angle % tau) + tau) % tau;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Double-precision boundary samples only. This does not prove a closed, simple region. */
export function sampleSketchEntity(sketch: SketchFeature, entityId: string, options: CurveSamplingOptions = {}): SampledEntity {
  const chordErrorMm = options.chordErrorMm ?? 0.05, maxStepRadians = (options.maxStepDegrees ?? 5) * Math.PI / 180;
  if (!Number.isFinite(chordErrorMm) || chordErrorMm <= 0 || !Number.isFinite(maxStepRadians) || maxStepRadians <= 0 || maxStepRadians > Math.PI)
    throw new DomainError('INVALID_CURVE_PRECISION', '弦误差须为正数，最大步进角须在 (0,180] 度');
  const entity = sketch.entities.find(e => e.id === entityId);
  if (!entity) throw new DomainError('REFERENCE_MISSING', '细分实体不属于当前草图');
  const byId = new Map(sketch.points.map(p => [p.id, p.position]));
  const point = (id: string): Vec2 => {
    const p = byId.get(id);
    if (!p || p.length !== 2 || p.some(v => !Number.isFinite(v))) throw new DomainError('INVALID_POINT', '细分需要有限的领域点');
    return p;
  };
  const checked = (result: SampledEntity) => {
    for (const p of result.points) if (p.some(v => !Number.isFinite(v)) || toWorld(sketch.plane, p).some(v => Math.abs(v) > 10000))
      throw new DomainError('CURVE_WORKSPACE_RANGE', '曲线边界超出世界坐标 ±10000 mm');
    return result;
  };
  if (entity.kind === 'line') {
    const a = point(entity.startPointId), b = point(entity.endPointId);
    if (distance(a, b) <= 1e-6) throw new DomainError('DEGENERATE_GEOMETRY', '无法细分零长度线段');
    return checked({ entityId, kind: entity.kind, points: [[...a], [...b]], closed: false, segmentCount: 1, sweepRadians: 0, maxStepRadians: 0, chordErrorBoundMm: 0 });
  }
  const center = point(entity.centerPointId); let radius: number, start = 0, sweep = tau, endpointErrorMm = 0;
  let a: Vec2 | undefined, b: Vec2 | undefined;
  if (entity.kind === 'circle') radius = entity.radius;
  else {
    a = point(entity.startPointId); b = point(entity.endPointId); radius = distance(center, a);
    if (typeof entity.clockwise !== 'boolean' || distance(a, b) <= 1e-6) throw new DomainError('DEGENERATE_GEOMETRY', '圆弧方向或端点退化');
    endpointErrorMm = Math.abs(distance(center, b) - radius);
    if (endpointErrorMm > 1e-5) throw new DomainError('UNSOLVED_ARC', '圆弧两端半径不同，必须先完成真实求解');
    start = Math.atan2(a[1] - center[1], a[0] - center[0]);
    const end = Math.atan2(b[1] - center[1], b[0] - center[0]);
    sweep = entity.clockwise ? -positive(start - end) : positive(end - start);
  }
  if (!Number.isFinite(radius) || radius <= 1e-6 || radius > 10000 || Math.abs(sweep) === 0)
    throw new DomainError('DEGENERATE_GEOMETRY', '曲线需要有效半径与非零扫角');
  // Include analytic extrema: a sampled vertex need not land on the farthest point of a curve.
  for (let axis = 0; axis < 3; axis++) {
    const extremum = Math.atan2(sketch.plane.v[axis]!, sketch.plane.u[axis]!);
    for (const angle of [extremum, extremum + Math.PI]) {
      const offset = sweep > 0 ? positive(angle - start) : positive(start - angle);
      if (entity.kind === 'circle' || offset <= Math.abs(sweep)) {
        const world = toWorld(sketch.plane, [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]);
        if (world.some(v => Math.abs(v) > 10000)) throw new DomainError('CURVE_WORKSPACE_RANGE', '曲线边界超出世界坐标 ±10000 mm');
      }
    }
  }
  const availableErrorMm = chordErrorMm - endpointErrorMm;
  if (availableErrorMm <= 0) throw new DomainError('CURVE_ENDPOINT_PRECISION', '保留领域端点无法满足指定弦误差，请提高求解精度或放宽细分误差');
  // Sagitta = 2r sin²(step/4). asin avoids cancellation in acos(1-error/r) at small tolerances.
  const chordStep = 4 * Math.asin(Math.sqrt(Math.min(1, availableErrorMm / (2 * radius))));
  const count = Math.max(entity.kind === 'circle' ? 24 : 1, Math.ceil(Math.abs(sweep) / Math.min(chordStep, maxStepRadians)));
  if (!Number.isSafeInteger(count) || count > CURVE_SEGMENT_LIMIT)
    throw new DomainError('CURVE_CAPACITY', `曲线需要 ${count} 段，超过 ${CURVE_SEGMENT_LIMIT} 上限；不降低精度`);
  const actualStep = Math.abs(sweep) / count, chordErrorBoundMm = 2 * radius * Math.sin(actualStep / 4) ** 2 + endpointErrorMm;
  const points = Array.from({ length: count + 1 }, (_, i): Vec2 => {
    const angle = start + sweep * i / count; return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
  });
  if (a && b) { points[0] = [...a]; points[count] = [...b]; }
  else points[count] = [...points[0]!];
  return checked({ entityId, kind: entity.kind, points, closed: entity.kind === 'circle', segmentCount: count, sweepRadians: sweep, maxStepRadians: actualStep, chordErrorBoundMm });
}
