import type { SketchFeature, Vec2 } from '../core/model/document.ts';
import { BASE_PLANES, type BasePlane } from '../core/geometry/plane.ts';

export type RegionFixture =
  | { kind: 'polygon'; id: string; points: Vec2[]; reverseEdges?: boolean; separateEndpoints?: boolean }
  | { kind: 'circle'; id: string; center: Vec2; radius: number }
  | { kind: 'semicircle' | 'split-circle'; id: string; center: Vec2; radius: number; clockwise?: boolean }
  | { kind: 'lens'; id: string };

/** Fully specified fixture geometry; still executed through the real native solver. */
export function contourFixture(id: string, fixtures: RegionFixture[], plane: BasePlane = 'XY'): SketchFeature {
  const sketch: SketchFeature = { id, kind: 'sketch', name: id, visible: true, plane: structuredClone(BASE_PLANES[plane]), points: [], entities: [], constraints: [] };
  const point = (id: string, position: Vec2) => {
    sketch.points.push({ id, position: [...position] }); sketch.constraints.push({ id: `${id}-fixed`, kind: 'fixed', refs: [{ pointId: id }], fixedPosition: [...position] }); return id;
  };
  const line = (id: string, a: string, b: string) => sketch.entities.push({ id, kind: 'line', startPointId: a, endPointId: b });
  for (const f of fixtures) {
    if (f.kind === 'polygon') {
      const points = f.separateEndpoints ? [] : f.points.map((p, i) => point(`${f.id}-p${i}`, p));
      for (let i = 0; i < f.points.length; i++) {
        const a = f.separateEndpoints ? point(`${f.id}-e${i}-a`, f.points[i]!) : points[i]!;
        const b = f.separateEndpoints ? point(`${f.id}-e${i}-b`, f.points[(i + 1) % f.points.length]!) : points[(i + 1) % f.points.length]!;
        line(`${f.id}-e${i}`, f.reverseEdges ? b : a, f.reverseEdges ? a : b);
      }
    } else if (f.kind === 'lens') {
      const left = point(`${f.id}-c1`, [-3, 0]), right = point(`${f.id}-c2`, [3, 0]);
      const top = point(`${f.id}-top`, [0, 4]), bottom = point(`${f.id}-bottom`, [0, -4]);
      sketch.entities.push({ id: `${f.id}-arc1`, kind: 'arc', centerPointId: left, startPointId: top, endPointId: bottom, clockwise: true },
        { id: `${f.id}-arc2`, kind: 'arc', centerPointId: right, startPointId: bottom, endPointId: top, clockwise: true });
    } else {
      const center = point(`${f.id}-center`, f.center);
      if (f.kind === 'circle') {
        sketch.entities.push({ id: f.id, kind: 'circle', centerPointId: center, radius: f.radius });
        sketch.constraints.push({ id: `${f.id}-radius`, kind: 'radius', refs: [{ entityId: f.id }], value: f.radius });
      } else {
        const a = point(`${f.id}-a`, [f.center[0] - f.radius, f.center[1]]), b = point(`${f.id}-b`, [f.center[0] + f.radius, f.center[1]]);
        sketch.entities.push({ id: `${f.id}-arc1`, kind: 'arc', centerPointId: center, startPointId: a, endPointId: b, clockwise: f.clockwise ?? false });
        if (f.kind === 'semicircle') line(`${f.id}-diameter`, b, a);
        else sketch.entities.push({ id: `${f.id}-arc2`, kind: 'arc', centerPointId: center, startPointId: b, endPointId: a, clockwise: f.clockwise ?? false });
      }
    }
  }
  return sketch;
}
export const RECTANGLE_40_30: Vec2[] = [[0, 0], [40, 0], [40, 30], [0, 30]];
export const RECTANGLE_HOLE_10: Vec2[] = [[15, 10], [25, 10], [25, 20], [15, 20]];
