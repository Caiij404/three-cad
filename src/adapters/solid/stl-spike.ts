import { BufferAttribute, BufferGeometry, Mesh } from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import type { TriangleMesh } from '../../core/mesh-types.ts';
import { requireSolid } from '../../core/geometry/mesh-metrics.ts';

export function exportBinaryStl(mesh: TriangleMesh): ArrayBuffer {
  requireSolid(mesh);
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(new Float64Array(mesh.positions),3));
  const object=new Mesh(geometry);
  try {
    object.updateMatrixWorld(true);
    // Current pinned exporter returns a DataView; declarations also allow string.
    const output=new STLExporter().parse(object,{binary:true});
    if (!(output instanceof DataView)) throw new Error('STL_PROTOCOL: binary DataView required');
    return output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength) as ArrayBuffer;
  } finally {
    geometry.dispose();
    const materials=Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material=>material.dispose());
  }
}
