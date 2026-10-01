import { BoxGeometry, ShapeUtils, Vector2 } from 'three';
import { CSG, Polygon, Vertex } from './vendor/csg-lib.js';
import type { BoxInput, SolidInput, TriangleMesh, Vec3 } from '../../core/mesh-types.ts';
import { cross, dot, norm, requireSolid, sub, trianglePoints } from '../../core/geometry/mesh-metrics.ts';
import { extrudeSketch } from './extrude-sketch.ts';

function validateBox(box: BoxInput): void {
  if (!box || !Array.isArray(box.center) || !Array.isArray(box.size) || box.center.length!==3 || box.size.length!==3
      || !box.center.every(v=>Number.isFinite(v) && Math.abs(v)<=10000)
      || !box.size.every(v=>Number.isFinite(v) && v>=1e-3 && v<=10000)) {
    throw new Error('INVALID_BOX: finite center ±10000 and size [0.001,10000] mm required');
  }
}
function boxMesh(box: BoxInput): TriangleMesh {
  validateBox(box);
  const geometry = new BoxGeometry(...box.size);
  try {
    // Preserve JS double translation; do not transform a Float32 buffer in place.
    const attr=geometry.getAttribute('position'), index=geometry.getIndex()!;
    const positions: number[]=[];
    for (const i of index.array) positions.push(attr.getX(i)+box.center[0], attr.getY(i)+box.center[1], attr.getZ(i)+box.center[2]);
    return { positions };
  } finally { geometry.dispose(); }
}
function toCsg(mesh: TriangleMesh): CSG {
  requireSolid(mesh);
  const points=trianglePoints(mesh), polygons: Polygon[]=[];
  for (let i=0; i<points.length; i+=3) {
    const a=points[i]!,b=points[i+1]!,c=points[i+2]!;
    const n=cross(sub(b,a),sub(c,a)), magnitude=norm(n);
    const vector=(p: Vec3)=>({x:p[0],y:p[1],z:p[2]});
    const normal=vector(n.map(v=>v/magnitude) as Vec3);
    polygons.push(new Polygon([a,b,c].map(p=>new Vertex(vector(p),normal))));
  }
  return CSG.fromPolygons(polygons);
}

export function csgMesh(csg: CSG, conform=true): TriangleMesh {
  const polygons=csg.polygons.map(p=>p.vertices.map(v=>[v.pos.x,v.pos.y,v.pos.z] as Vec3));
  const all: Vec3[]=[];
  for (const point of polygons.flat()) if (!all.some(p=>norm(sub(p,point))<=1e-7)) all.push(point);
  if (all.length>2000) throw new Error('CSG_CAPACITY: M0 conformity bridge limited to 2000 vertices');
  const positions: number[]=[];
  for (const polygon of polygons) {
    if (!conform) {
      for (let i=1;i<polygon.length-1;i++) positions.push(...polygon[0]!,...polygon[i]!,...polygon[i+1]!);
      continue;
    }
    // BSP clipping can leave a long edge opposite two shorter edges. Include all
    // existing vertices lying on each polygon edge, then triangulate from its center.
    const boundary: Vec3[]=[];
    for (let i=0;i<polygon.length;i++) {
      const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,ab=sub(b,a),length2=dot(ab,ab);
      if (length2<=1e-14) throw new Error('CSG_DEGENERATE: repeated polygon vertex');
      const along=all.map(p=>({p,t:dot(sub(p,a),ab)/length2}))
        .filter(({p,t})=>t>=-1e-9 && t<1-1e-9 && norm(cross(sub(p,a),ab))/Math.sqrt(length2)<=1e-7)
        .sort((x,y)=>x.t-y.t);
      boundary.push(...along.map(v=>v.p));
    }
    const center=[0,1,2].map(axis=>polygon.reduce((s,p)=>s+p[axis]!,0)/polygon.length) as Vec3;
    for (let i=0;i<boundary.length;i++) positions.push(...center,...boundary[i]!,...boundary[(i+1)%boundary.length]!);
  }
  return { positions };
}

export function booleanBoxes(input: Extract<SolidInput,{kind:'boolean'}>, conform=true): TriangleMesh {
  if (!['union','subtract','intersect'].includes(input.operation)) throw new Error('INVALID_OPERATION: unknown boolean');
  const a=toCsg(boxMesh(input.a)),b=toCsg(boxMesh(input.b));
  const mesh=csgMesh(a[input.operation](b),conform);
  if (conform && mesh.positions.length) requireSolid(mesh);
  return mesh;
}

export function holeExtrusion(input: Extract<SolidInput,{kind:'hole-extrusion'}>): TriangleMesh {
  if (!['XY','XZ','YZ'].includes(input.plane) || !Number.isFinite(input.depth)
      || Math.abs(input.depth)<1e-3 || Math.abs(input.depth)>10000) throw new Error('INVALID_EXTRUSION: plane/depth');
  // M0 fixture only: outer 40×30 CCW, inner 10×10 CW. General contour validation is T-202.
  const outer=[[0,0],[40,0],[40,30],[0,30]].map(p=>new Vector2(p[0],p[1]));
  const hole=[[15,10],[15,20],[25,20],[25,10]].map(p=>new Vector2(p[0],p[1]));
  const faces=ShapeUtils.triangulateShape(outer,[hole]);
  const flat=[...outer,...hole];
  const low=Math.min(0,input.depth),high=Math.max(0,input.depth);
  const lift=(p: Vector2,d:number): Vec3=>input.plane==='XY' ? [p.x,p.y,d]
    : input.plane==='XZ' ? [p.x,-d,p.y] : [d,p.x,p.y];
  const positions:number[]=[];
  const triangle=(a:Vec3,b:Vec3,c:Vec3)=>positions.push(...a,...b,...c);
  for (const face of faces) {
    let [a,b,c]=face.map(i=>flat[i]!) as [Vector2,Vector2,Vector2];
    if ((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<0) [b,c]=[c,b];
    triangle(lift(a,high),lift(b,high),lift(c,high));
    triangle(lift(c,low),lift(b,low),lift(a,low));
  }
  for (const ring of [outer,hole]) for (let i=0;i<ring.length;i++) {
    const a=ring[i]!,b=ring[(i+1)%ring.length]!;
    triangle(lift(a,low),lift(b,low),lift(b,high));
    triangle(lift(a,low),lift(b,high),lift(a,high));
  }
  const mesh={positions}; requireSolid(mesh); return mesh;
}
export function runSolid(input: SolidInput): TriangleMesh {
  if (!input || !['boolean','hole-extrusion','sketch-extrusion'].includes(input.kind)) throw new Error('INVALID_SOLID_INPUT: unsupported kind');
  if (input.kind==='sketch-extrusion') return extrudeSketch(input);
  return input.kind==='boolean' ? booleanBoxes(input) : holeExtrusion(input);
}
