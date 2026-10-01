import type { TriangleMesh } from '../core/mesh-types.ts';

// Independent reader: uses file layout, not exporter methods or its scene objects.
export function parseBinaryStl(buffer: ArrayBuffer): { mesh: TriangleMesh; triangles: number } {
  if (buffer.byteLength<84) throw new Error('INVALID_STL: truncated header');
  const view=new DataView(buffer),count=view.getUint32(80,true);
  if (buffer.byteLength!==84+50*count) throw new Error('INVALID_STL: triangle count/length mismatch');
  const positions:number[]=[];
  for (let i=0;i<count;i++) {
    const base=84+50*i;
    const normal=[0,1,2].map(axis=>view.getFloat32(base+4*axis,true));
    if (!normal.every(Number.isFinite)) throw new Error('INVALID_STL: non-finite normal');
    for (let j=0;j<9;j++) positions.push(view.getFloat32(base+12+4*j,true));
  }
  if (!positions.every(Number.isFinite)) throw new Error('INVALID_STL: non-finite coordinate');
  return {mesh:{positions},triangles:count};
}
