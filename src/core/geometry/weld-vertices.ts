import type { Vec3 } from '../mesh-types.ts';

/** Preserve the first matching representative, rather than unioning transitive neighbors. */
export function weldVertices(points:Vec3[],tolerance:number):{vertices:Vec3[];ids:number[]} {
  const vertices:Vec3[]=[],ids:number[]=[],width=2*tolerance;
  const distance=(p:Vec3,q:Vec3)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
  // Unusual tolerance/coordinate scales retain the original exact scan semantics.
  const grid=Number.isFinite(width)&&width>0&&points.every(p=>p.every(value=>Number.isSafeInteger(Math.floor(value/width))));
  const buckets=new Map<number,Map<number,Map<number,number[]>>>();
  for(const p of points) {
    let old=-1;
    const cell=p.map(value=>Math.floor(value/width));
    if(grid) {
      for(let x=-1;x<=1;x++) {
        const column=buckets.get(cell[0]!+x);if(!column)continue;
        for(let y=-1;y<=1;y++) {
          const row=column.get(cell[1]!+y);if(!row)continue;
          for(let z=-1;z<=1;z++) {
            const candidates=row.get(cell[2]!+z);if(!candidates)continue;
            for(const id of candidates)if((old<0||id<old)&&distance(p,vertices[id]!)<=tolerance)old=id;
          }
        }
      }
    } else old=vertices.findIndex(q=>distance(p,q)<=tolerance);
    if(old<0) {
      old=vertices.length;vertices.push(p);
      if(grid) {
        const column=buckets.get(cell[0]!)??new Map<number,Map<number,number[]>>(),row=column.get(cell[1]!)??new Map<number,number[]>(),bucket=row.get(cell[2]!)??[];
        bucket.push(old);row.set(cell[2]!,bucket);column.set(cell[1]!,row);buckets.set(cell[0]!,column);
      }
    }
    ids.push(old);
  }
  return{vertices,ids};
}
