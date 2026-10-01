import { createEmptyProject, DomainError, type Constraint, type EntityRef, type SketchFeature, type Vec2 } from '../model/document.ts';
import { validateDocument } from '../model/validate-document.ts';

function checked(sketch: SketchFeature): SketchFeature {
  const document = createEmptyProject(); document.features = [sketch]; validateDocument(document); return sketch;
}
export function addSketchConstraint(sketch: SketchFeature, kind: Constraint['kind'], selectionIds: string[], value?: number, id = crypto.randomUUID()): SketchFeature {
  const refs: EntityRef[] = selectionIds.map(selected => {
    if (sketch.points.some(p => p.id === selected)) return { pointId: selected };
    if (sketch.entities.some(e => e.id === selected)) return { entityId: selected };
    throw new DomainError('REFERENCE_TYPE', '请只选择当前草图的点、线、圆或圆弧');
  });
  const constraint: Constraint = { id, kind, refs };
  if (['length', 'distance', 'radius', 'angle'].includes(kind)) constraint.value = value;
  if (kind === 'fixed') {
    const ref = refs[0]; const point = ref && 'pointId' in ref ? sketch.points.find(p => p.id === ref.pointId) : undefined;
    if (point) constraint.fixedPosition = [...point.position];
  }
  const result = structuredClone(sketch); result.constraints.push(constraint); return checked(result);
}
export function editSketchConstraint(sketch: SketchFeature, id: string, update: { value?: number; fixedPosition?: Vec2 }): SketchFeature {
  const result = structuredClone(sketch), constraint = result.constraints.find(c => c.id === id);
  if (!constraint) throw new DomainError('REFERENCE_MISSING', '约束已不存在');
  if (constraint.kind === 'fixed') {
    if (!update.fixedPosition || update.value !== undefined) throw new DomainError('INVALID_CONSTRAINT_VALUE', '固定点需要X/Y坐标');
    constraint.fixedPosition = [...update.fixedPosition];
  } else if (['length', 'distance', 'radius', 'angle'].includes(constraint.kind)) {
    if (update.value === undefined || update.fixedPosition !== undefined) throw new DomainError('INVALID_CONSTRAINT_VALUE', '尺寸需要一个有限数值');
    constraint.value = update.value;
  } else throw new DomainError('INVALID_CONSTRAINT_VALUE', '该约束没有可修改的数值');
  return checked(result);
}
export function removeSketchConstraint(sketch: SketchFeature, id: string): SketchFeature {
  if (!sketch.constraints.some(c => c.id === id)) throw new DomainError('REFERENCE_MISSING', '约束已不存在');
  const result = structuredClone(sketch); result.constraints = result.constraints.filter(c => c.id !== id); return checked(result);
}
export interface DimensionLabel { id: string; position: Vec2; text: string }
export function sketchDimensionLabels(sketch: SketchFeature): DimensionLabel[] {
  const points = new Map(sketch.points.map(p => [p.id, p.position])), entities = new Map(sketch.entities.map(e => [e.id, e]));
  const point = (id: string) => points.get(id)!;
  const midpoint = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const labels: DimensionLabel[] = [];
  for (const c of sketch.constraints) {
    const ref = c.refs[0]!, e = entities.get('entityId' in ref ? ref.entityId : ''); let position: Vec2 | undefined, text = '';
    if (c.kind === 'length' && e?.kind === 'line') {
      const a = point(e.startPointId), b = point(e.endPointId); position = midpoint(a, b); text = `L ${Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(3)} mm`;
    } else if (c.kind === 'distance') {
      const refs = c.refs.map(r => point('pointId' in r ? r.pointId : '')), [a, b] = refs as [Vec2, Vec2];
      position = midpoint(a, b); text = `D ${Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(3)} mm`;
    } else if (c.kind === 'radius' && e && e.kind !== 'line') {
      const center = point(e.centerPointId), r = e.kind === 'circle' ? e.radius : Math.hypot(center[0] - point(e.startPointId)[0], center[1] - point(e.startPointId)[1]);
      position = e.kind === 'circle' ? [center[0] + r / Math.SQRT2, center[1] + r / Math.SQRT2] : midpoint(center, point(e.startPointId)); text = `R ${r.toFixed(3)} mm`;
    } else if (c.kind === 'angle' && e?.kind === 'line') {
      const otherRef = c.refs[1]!, other = entities.get('entityId' in otherRef ? otherRef.entityId : '');
      if (other?.kind === 'line') {
        const a = point(e.startPointId), b = point(e.endPointId), x = point(other.startPointId), y = point(other.endPointId);
        const av = [b[0] - a[0], b[1] - a[1]], bv = [y[0] - x[0], y[1] - x[1]];
        position = midpoint(midpoint(a, b), midpoint(x, y)); text = `${(Math.atan2(Math.abs(av[0]! * bv[1]! - av[1]! * bv[0]!), av[0]! * bv[0]! + av[1]! * bv[1]!) * 180 / Math.PI).toFixed(3)}°`;
      }
    }
    if (position) labels.push({ id: c.id, position, text });
  }
  return labels;
}
