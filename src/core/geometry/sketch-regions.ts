import { DomainError, type ExtrudeFeature, type SketchFeature, type Vec2 } from '../model/document.ts';
import { sampleSketchEntity, type CurveSamplingOptions, type SampledEntity } from './sample-entity.ts';
import { boundaryCurve, CONTOUR_TOLERANCE_MM, curveContacts, distance2D, insideAnalyticLoop, type BoundaryCurve } from './curve-contact.ts';

export interface ContourLoop {
  id: string; entityIds: string[]; points: Vec2[];
  analyticAreaMm2: number; polygonAreaMm2: number; depth: number; parentLoopId?: string;
}
export interface SketchRegion { outer: ContourLoop; holes: ContourLoop[]; definition: ExtrudeFeature['region']; areaMm2: number }
export interface SketchRegionCatalog { sketchId: string; loops: ContourLoop[]; regions: SketchRegion[] }
interface Edge { curve: BoundaryCurve; sample: SampledEntity; nodes?: [number, number] }
interface Walk { edge: Edge; forward: boolean }
interface InternalLoop { public: ContourLoop; walks: Walk[] }
const tolerance = CONTOUR_TOLERANCE_MM;
const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
const loopId = (ids: string[]) => `loop:${JSON.stringify([...ids].sort())}`;

export function polygonArea(points: Vec2[]): number {
  const origin = points[0]!;
  return points.reduce((area, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return area + (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  }, 0) / 2;
}
function insidePolygon(p: Vec2, points: Vec2[]): boolean {
  let inside = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}
function analyticArea(walks: Walk[], origin: Vec2): number {
  return walks.reduce((area, { edge, forward }) => {
    const c = edge.curve, sign = forward ? 1 : -1;
    if (c.kind === 'line') return area + sign * ((c.a[0] - origin[0]) * (c.b[1] - origin[1]) - (c.a[1] - origin[1]) * (c.b[0] - origin[0])) / 2;
    const end = c.start + c.sweep, cx = c.center[0] - origin[0], cy = c.center[1] - origin[1];
    return area + sign * (c.radius * cx * (Math.sin(end) - Math.sin(c.start)) - c.radius * cy * (Math.cos(end) - Math.cos(c.start)) + c.radius * c.radius * c.sweep) / 2;
  }, 0);
}

/** Every non-construction entity participates; open/branched components are explicit errors. */
export function buildSketchRegions(sketch: SketchFeature, options: CurveSamplingOptions = {}): SketchRegionCatalog {
  if (!sketch.entities.length) throw new DomainError('CONTOUR_EMPTY', '草图没有可用轮廓', sketch.id);
  if (new Set(sketch.entities.map(e => e.id)).size !== sketch.entities.length) throw new DomainError('DUPLICATE_ID', '轮廓实体ID重复', sketch.id);
  const requestedError = options.chordErrorMm ?? 0.05;
  if (requestedError <= tolerance) throw new DomainError('CONTOUR_PRECISION', '轮廓弦误差必须大于1e-6mm闭合预算', sketch.id);
  const edges: Edge[] = [...sketch.entities].sort((a, b) => a.id.localeCompare(b.id)).map(entity => ({
    curve: boundaryCurve(sketch, entity), sample: sampleSketchEntity(sketch, entity.id,
      { ...options, chordErrorMm: requestedError - (entity.kind === 'circle' ? 0 : tolerance) }),
  }));
  const endpointRecords: Array<{ edge: Edge; side: 0 | 1; point: Vec2 }> = [];
  for (const edge of edges) if (edge.curve.kind !== 'circle') {
    endpointRecords.push({ edge, side: 0, point: edge.curve.a! }, { edge, side: 1, point: edge.curve.b! });
  }
  // Union only numerically close endpoints, then reject transitive chains wider than the tolerance.
  const parents = endpointRecords.map((_, i) => i);
  const root = (i: number): number => { while (parents[i] !== i) i = parents[i]!; return i; };
  for (let i = 0; i < endpointRecords.length; i++) for (let j = i + 1; j < endpointRecords.length; j++) {
    if (distance2D(endpointRecords[i]!.point, endpointRecords[j]!.point) <= tolerance) parents[root(j)] = root(i);
  }
  const groups = new Map<number, typeof endpointRecords>();
  endpointRecords.forEach((record, i) => { const key = root(i); groups.set(key, [...(groups.get(key) ?? []), record]); });
  const nodes: Vec2[] = [], adjacency: Edge[][] = [];
  for (const group of groups.values()) {
    if (group.some(a => group.some(b => distance2D(a.point, b.point) > tolerance)))
      throw new DomainError('CONTOUR_AMBIGUOUS_ENDPOINT', '近端点形成超过1e-6mm的传递链，无法确定闭合点', sketch.id);
    const node = nodes.length; nodes.push([...group[0]!.point]); adjacency.push([]);
    for (const { edge, side } of group) { edge.nodes ??= [-1, -1]; edge.nodes[side] = node; adjacency[node]!.push(edge); }
  }
  for (const edge of edges) if (edge.nodes && edge.nodes[0] === edge.nodes[1]) throw new DomainError('CONTOUR_DEGENERATE', `实体 ${edge.curve.id} 的端点合并后退化`, sketch.id);
  for (let i = 0; i < adjacency.length; i++) {
    if (adjacency[i]!.length < 2) throw new DomainError('CONTOUR_OPEN', `草图有未闭合端点 (${nodes[i]!.join(', ')})`, sketch.id);
    if (adjacency[i]!.length > 2) throw new DomainError('CONTOUR_BRANCH', `草图端点连接 ${adjacency[i]!.length} 条边，无法形成单一边界`, sketch.id);
  }
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i]!, b = edges[j]!, contact = curveContacts(a.curve, b.curve);
    const common = a.nodes?.filter(n => b.nodes?.includes(n)) ?? [];
    const endpointBudget = (a.curve.kind === 'line' ? 0 : a.curve.endpointErrorMm) + (b.curve.kind === 'line' ? 0 : b.curve.endpointErrorMm);
    if (contact.overlap) throw new DomainError('CONTOUR_OVERLAP', `实体 ${a.curve.id} 与 ${b.curve.id} 重叠`, sketch.id);
    if (contact.points.some(p => !common.some(n => distance2D(p, nodes[n]!) <= tolerance + endpointBudget)))
      throw new DomainError('CONTOUR_CONTACT', `实体 ${a.curve.id} 与 ${b.curve.id} 存在交叉、相切或过近接触`, sketch.id);
  }
  const visited = new Set<string>(), internal: InternalLoop[] = [];
  for (const first of edges) {
    if (visited.has(first.curve.id)) continue;
    const walks: Walk[] = [];
    if (!first.nodes) { visited.add(first.curve.id); walks.push({ edge: first, forward: true }); }
    else {
      let edge = first, node = first.nodes[0]; const startNode = node;
      do {
        if (visited.has(edge.curve.id)) throw new DomainError('CONTOUR_BRANCH', '轮廓遍历提前重复实体', sketch.id);
        visited.add(edge.curve.id); const forward = edge.nodes![0] === node; walks.push({ edge, forward });
        node = edge.nodes![forward ? 1 : 0]; edge = adjacency[node]!.find(e => e.curve.id !== edge.curve.id)!;
      } while (node !== startNode);
    }
    const points: Vec2[] = [];
    for (const { edge, forward } of walks) {
      const samples = edge.sample.points.map(p => [...p] as Vec2); if (!forward) samples.reverse();
      if (edge.nodes) { samples[0] = [...nodes[edge.nodes[forward ? 0 : 1]]!]; samples[samples.length - 1] = [...nodes[edge.nodes[forward ? 1 : 0]]!]; }
      points.push(...samples.slice(0, -1));
    }
    const area = polygonArea(points), exactArea = analyticArea(walks, points[0]!);
    if (points.length < 3 || Math.abs(area) <= tolerance * tolerance || Math.abs(exactArea) <= tolerance * tolerance)
      throw new DomainError('CONTOUR_DEGENERATE', '轮廓面积退化', sketch.id);
    const entityIds = walks.map(w => w.edge.curve.id);
    internal.push({ public: { id: loopId(entityIds), entityIds, points, analyticAreaMm2: Math.abs(exactArea), polygonAreaMm2: Math.abs(area), depth: 0 }, walks });
  }
  // An exact simple boundary may tessellate into a collision. Reject rather than changing its topology.
  const segments = internal.flatMap((loop, loopIndex) => loop.public.points.map((a, i, points) => ({ loopIndex, i, count: points.length, a, b: points[(i + 1) % points.length]! })));
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i]!, b = segments[j]!;
    if (a.loopIndex === b.loopIndex && (Math.abs(a.i - b.i) === 1 || Math.abs(a.i - b.i) === a.count - 1)) continue;
    if ([0, 1].some(axis => Math.max(a.a[axis]!, a.b[axis]!) + tolerance < Math.min(b.a[axis]!, b.b[axis]!) || Math.max(b.a[axis]!, b.b[axis]!) + tolerance < Math.min(a.a[axis]!, a.b[axis]!))) continue;
    const contact = curveContacts({ id: '', kind: 'line', a: a.a, b: a.b }, { id: '', kind: 'line', a: b.a, b: b.b });
    if (contact.overlap || contact.points.length) throw new DomainError('CONTOUR_PRECISION_COLLISION', '细分折线存在接触或交叉，请提高曲线细分精度', sketch.id);
  }
  for (const child of internal) {
    const containers: InternalLoop[] = [];
    for (const candidate of internal) if (candidate !== child) {
      const point = child.public.points[0]!, analyticInside = insideAnalyticLoop(point, candidate.walks.map(w => w.edge.curve));
      if (analyticInside !== insidePolygon(point, candidate.public.points)) throw new DomainError('CONTOUR_PRECISION_COLLISION', '细分改变了区域包含关系，请提高曲线细分精度', sketch.id);
      if (analyticInside) containers.push(candidate);
    }
    child.public.depth = containers.length;
    const parent = containers.sort((a, b) => a.public.analyticAreaMm2 - b.public.analyticAreaMm2)[0];
    if (parent) child.public.parentLoopId = parent.public.id;
    const wantsPositive = child.public.depth % 2 === 0;
    if ((polygonArea(child.public.points) > 0) !== wantsPositive) child.public.points.reverse();
  }
  const loops = internal.map(l => l.public).sort((a, b) => a.id.localeCompare(b.id));
  const regions = loops.filter(l => l.depth % 2 === 0).map(outer => {
    const holes = loops.filter(l => l.parentLoopId === outer.id && l.depth === outer.depth + 1);
    return { outer, holes, definition: { outerEntityIds: [...outer.entityIds], holeEntityIds: holes.map(h => [...h.entityIds]) },
      areaMm2: outer.analyticAreaMm2 - holes.reduce((sum, h) => sum + h.analyticAreaMm2, 0) };
  });
  return { sketchId: sketch.id, loops, regions };
}

export function selectSketchRegion(catalog: SketchRegionCatalog, outerEntityIds?: string[]): SketchRegion {
  if (!outerEntityIds) {
    if (catalog.regions.length !== 1) throw new DomainError('REGION_SELECTION_REQUIRED', `草图有 ${catalog.regions.length} 个区域，请明确选择`, catalog.sketchId);
    return catalog.regions[0]!;
  }
  const region = catalog.regions.find(r => sameIds(r.outer.entityIds, outerEntityIds));
  if (!region) throw new DomainError('REGION_MISSING', '所选实体不是一个完整外轮廓', catalog.sketchId);
  return region;
}
export function resolveSketchRegion(sketch: SketchFeature, definition: ExtrudeFeature['region']): SketchRegion {
  const region = selectSketchRegion(buildSketchRegions(sketch), definition.outerEntityIds);
  if (region.holes.length !== definition.holeEntityIds.length || region.holes.some(h => !definition.holeEntityIds.some(ids => sameIds(h.entityIds, ids))))
    throw new DomainError('REGION_HOLES_CHANGED', '保存的孔洞来源与当前轮廓不一致，请重新选择区域', sketch.id);
  return region;
}
