import { ShapeUtils, Vector2 } from 'three';
import type { SolidInput, TriangleMesh } from '../../core/mesh-types.ts';
import { createEmptyProject, DomainError, type Vec2, type Vec3 } from '../../core/model/document.ts';
import { validateDocument } from '../../core/model/validate-document.ts';
import { resolveSketchRegion, polygonArea } from '../../core/geometry/sketch-regions.ts';
import { cross, toWorld } from '../../core/geometry/plane.ts';
import { requireSolid } from '../../core/geometry/mesh-metrics.ts';
import { sampleSketchEntity } from '../../core/geometry/sample-entity.ts';

export type SketchExtrusionInput = Extract<SolidInput, { kind: 'sketch-extrusion' }>;

function withoutCollinearVertices(points: Vec2[]): Vec2[] {
  const result = points.map(p => [...p] as Vec2); let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      const a = result[(i + result.length - 1) % result.length]!, b = result[i]!, c = result[(i + 1) % result.length]!;
      const ab: Vec2 = [b[0] - a[0], b[1] - a[1]], bc: Vec2 = [c[0] - b[0], c[1] - b[1]];
      const lengthProduct = Math.hypot(...ab) * Math.hypot(...bc), determinant = ab[0] * bc[1] - ab[1] * bc[0];
      if (Math.abs(determinant) <= 1e-12 * lengthProduct && ab[0] * bc[0] + ab[1] * bc[1] > 0) {
        result.splice(i, 1); changed = true; break;
      }
    }
  }
  return result;
}

/** General solved sketch region, double coordinates throughout triangulation/lifting. */
export function extrudeSketch(input: SketchExtrusionInput): TriangleMesh {
  if (!Number.isFinite(input.depth) || Math.abs(input.depth) < 0.01 || Math.abs(input.depth) > 10000)
    throw new DomainError('INVALID_EXTRUSION_DEPTH', '拉伸深度须在±10000mm内，绝对值至少0.01mm');
  if (!input.sketch || !Array.isArray(input.sketch.points) || !Array.isArray(input.sketch.entities) || !Array.isArray(input.sketch.constraints))
    throw new DomainError('INVALID_EXTRUSION_INPUT', '拉伸需要完整领域草图');
  // Use the same strict schema at the Worker boundary; temporary IDs never enter the document.
  const used = new Set([input.sketch.id, ...input.sketch.points.map(p => p?.id), ...input.sketch.entities.map(e => e?.id), ...input.sketch.constraints.map(c => c?.id)]);
  const fresh = (prefix: string) => { let id = prefix; while (used.has(id)) id += '_'; used.add(id); return id; };
  validateDocument({ ...createEmptyProject({ id: fresh('extrusion-validation-document') }), features: [input.sketch,
    { id: fresh('extrusion-validation-feature'), kind: 'extrude', name: '临时几何验证', visible: true, sketchId: input.sketch.id, region: input.region, depth: input.depth }] });
  const region = resolveSketchRegion(input.sketch, input.region), normal = cross(input.sketch.plane.u, input.sketch.plane.v);
  const low = Math.min(0, input.depth), high = Math.max(0, input.depth);
  // Check true curve extrema at both ends, including extrema between sampled vertices.
  for (const depth of [low, high]) {
    const shifted = { ...input.sketch, plane: { ...input.sketch.plane, origin: input.sketch.plane.origin.map((o, axis) => o + normal[axis]! * depth) as Vec3 } };
    try { for (const id of [...input.region.outerEntityIds, ...input.region.holeEntityIds.flat()]) sampleSketchEntity(shifted, id); }
    catch (cause) {
      if (cause instanceof DomainError && cause.code === 'CURVE_WORKSPACE_RANGE') throw new DomainError('EXTRUSION_WORKSPACE_RANGE', '拉伸边界超出世界坐标±10000mm', input.sketch.id);
      throw cause;
    }
  }
  // Earcut may omit collinear cap vertices. Remove them from caps AND sides to avoid T-junctions.
  const rings = [region.outer, ...region.holes].map(loop => withoutCollinearVertices(loop.points));
  const vectors = rings.map(ring => ring.map(p => new Vector2(...p))), flat = rings.flat();
  const faces = ShapeUtils.triangulateShape(vectors[0]!, vectors.slice(1));
  let capAreaMm2 = 0;
  const positions: number[] = [];
  const lift = (point: Vec2, depth: number): Vec3 => toWorld(input.sketch.plane, point).map((o, axis) => o + normal[axis]! * depth) as Vec3;
  const triangle = (a: Vec3, b: Vec3, c: Vec3) => positions.push(...a, ...b, ...c);
  for (const face of faces) {
    let [a, b, c] = face.map(i => flat[i]!) as [Vec2, Vec2, Vec2];
    const determinant = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    capAreaMm2 += Math.abs(determinant) / 2; if (determinant < 0) [b, c] = [c, b];
    triangle(lift(a, high), lift(b, high), lift(c, high)); triangle(lift(c, low), lift(b, low), lift(a, low));
  }
  const boundaryAreaMm2 = rings.reduce((sum, ring) => sum + polygonArea(ring), 0);
  if (!faces.length || boundaryAreaMm2 <= 0 || Math.abs(capAreaMm2 - boundaryAreaMm2) > Math.max(1e-9, boundaryAreaMm2 * 1e-10))
    throw new DomainError('EXTRUSION_TRIANGULATION', '盖面三角化面积与外轮廓/孔洞不一致', input.sketch.id);
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    triangle(lift(a, low), lift(b, low), lift(b, high)); triangle(lift(a, low), lift(b, high), lift(a, high));
  }
  const mesh = { positions };
  try { requireSolid(mesh); }
  catch (cause) { throw new DomainError('EXTRUSION_INVALID_MESH', cause instanceof Error ? cause.message : String(cause), input.sketch.id); }
  return mesh;
}
