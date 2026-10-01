import type { TriangleMesh, Vec3 } from '../mesh-types.ts';

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const dot = (a: Vec3, b: Vec3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const norm = (a: Vec3): number => Math.hypot(...a);
export function trianglePoints(mesh: TriangleMesh): Vec3[] {
  if (!Array.isArray(mesh.positions) || mesh.positions.length % 9 !== 0
      || !mesh.positions.every(Number.isFinite)) throw new Error('INVALID_MESH: finite triangle coordinates required');
  const points: Vec3[] = [];
  for (let i=0; i<mesh.positions.length; i+=3) points.push(mesh.positions.slice(i,i+3) as Vec3);
  return points;
}

export function meshMetrics(mesh: TriangleMesh, tolerance=1e-6) {
  const points = trianglePoints(mesh);
  const vertices: Vec3[] = [];
  // Position weld by Euclidean distance, not STL's non-indexed vertex numbers.
  const ids = points.map(p => {
    const old = vertices.findIndex(q => norm(sub(p,q)) <= tolerance);
    if (old >= 0) return old;
    vertices.push(p); return vertices.length-1;
  });
  const edges = new Map<string, { count: number; balance: number }>();
  const links = new Map<number, Map<number, number[]>>();
  let signedVolume=0, degenerateTriangles=0;
  // Shift origin to the first point to reduce cancellation for translated solids.
  const origin = points[0] ?? [0,0,0] as Vec3;
  for (let i=0; i<points.length; i+=3) {
    const a=points[i]!,b=points[i+1]!,c=points[i+2]!;
    if (norm(cross(sub(b,a),sub(c,a))) <= tolerance*tolerance) degenerateTriangles++;
    signedVolume += dot(sub(a,origin),cross(sub(b,origin),sub(c,origin)))/6;
    for (let offset=0;offset<3;offset++) {
      const at=ids[i+offset]!,x=ids[i+(offset+1)%3]!,y=ids[i+(offset+2)%3]!;
      const link=links.get(at) ?? new Map<number,number[]>();
      link.set(x,[...(link.get(x) ?? []),y]); link.set(y,[...(link.get(y) ?? []),x]); links.set(at,link);
    }
    for (const [x,y] of [[ids[i]!,ids[i+1]!],[ids[i+1]!,ids[i+2]!],[ids[i+2]!,ids[i]!]]) {
      const key = x<y ? `${x}:${y}` : `${y}:${x}`;
      const edge = edges.get(key) ?? { count: 0, balance: 0 };
      edge.count++; edge.balance += x<y ? 1 : -1; edges.set(key,edge);
    }
  }
  const boundaryEdges = [...edges.values()].filter(e=>e.count===1).length;
  const nonManifoldEdges = [...edges.values()].filter(e=>e.count!==2).length;
  const windingErrors = [...edges.values()].filter(e=>e.count===2 && e.balance!==0).length;
  let nonManifoldVertices=0;
  for (const link of links.values()) {
    const seen=new Set<number>(),stack=[...link.keys()].slice(0,1);
    while (stack.length) { const at=stack.pop()!; if(seen.has(at))continue; seen.add(at); stack.push(...link.get(at)!); }
    if (seen.size!==link.size || [...link.values()].some(neighbors=>neighbors.length!==2)) nonManifoldVertices++;
  }
  const bounds = points.length ? {
    min: [0,1,2].map(axis=>Math.min(...points.map(p=>p[axis]!))) as Vec3,
    max: [0,1,2].map(axis=>Math.max(...points.map(p=>p[axis]!))) as Vec3 } : null;
  return { triangles: points.length/3, vertices: vertices.length, edges: edges.size,
    signedVolume, bounds, boundaryEdges, nonManifoldEdges, nonManifoldVertices, windingErrors, degenerateTriangles,
    closed: points.length>0 && nonManifoldEdges===0 && nonManifoldVertices===0 && windingErrors===0 && degenerateTriangles===0,
    toleranceMm: tolerance };
}

export function requireSolid(mesh: TriangleMesh): void {
  const metrics=meshMetrics(mesh);
  if (!metrics.closed || metrics.signedVolume<=1e-9) throw new Error(`INVALID_SOLID: ${JSON.stringify(metrics)}`);
}
