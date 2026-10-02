import type { TriangleMesh } from '../../core/mesh-types.ts';
/** Independent reader of the file layout; no exporter or scene objects. */
export function parseBinaryStl(buffer:ArrayBuffer):{mesh:TriangleMesh;triangles:number;normals:number[]} {
  if(buffer.byteLength<84)throw new Error('INVALID_STL: truncated header');
  const view=new DataView(buffer),count=view.getUint32(80,true);
  if(buffer.byteLength!==84+50*count)throw new Error('INVALID_STL: triangle count/length mismatch');
  const positions:number[]=[],normals:number[]=[];
  for(let i=0;i<count;i++){
    const base=84+50*i;
    for(let j=0;j<3;j++)normals.push(view.getFloat32(base+4*j,true));
    for(let j=0;j<9;j++)positions.push(view.getFloat32(base+12+4*j,true));
  }
  if(!normals.every(Number.isFinite)||!positions.every(Number.isFinite))throw new Error('INVALID_STL: non-finite normal/coordinate');
  return{mesh:{positions},triangles:count,normals};
}
