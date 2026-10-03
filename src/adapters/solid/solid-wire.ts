import type { SolidInput, TriangleMesh } from '../../core/mesh-types.ts';
import { DomainError } from '../../core/model/document.ts';

/** Transport only. Domain/cache/history keep ordinary serializable double-precision arrays. */
export interface SolidWireMesh { positions:Float64Array; triangles:number }
export type SolidWireInput=Exclude<SolidInput,{kind:'mesh-boolean'}>|{
  kind:'mesh-boolean';operation:'union'|'subtract'|'intersect';a:SolidWireMesh;b:SolidWireMesh;
};
const invalid=()=>new DomainError('INVALID_SOLID_WIRE','网格传输需要有限Float64坐标、完整三角面和独立ArrayBuffer');
export function encodeSolidMesh(mesh:TriangleMesh):SolidWireMesh {
  if(!Array.isArray(mesh?.positions)||mesh.positions.length%9||!mesh.positions.every(Number.isFinite))throw invalid();
  // Always allocate a fresh message buffer. Never detach a mesh retained by a caller or its history.
  return{positions:new Float64Array(mesh.positions),triangles:mesh.positions.length/9};
}
export function decodeSolidMesh(mesh:SolidWireMesh):TriangleMesh {
  if(!(mesh?.positions instanceof Float64Array)||!(mesh.positions.buffer instanceof ArrayBuffer)
    ||!Number.isSafeInteger(mesh.triangles)||mesh.triangles<0||mesh.positions.length!==mesh.triangles*9
    ||!mesh.positions.every(Number.isFinite))throw invalid();
  return{positions:Array.from(mesh.positions)};
}
export function encodeSolidInput(input:SolidInput):SolidWireInput {
  return input.kind==='mesh-boolean'?{...input,a:encodeSolidMesh(input.a),b:encodeSolidMesh(input.b)}:input;
}
export function decodeSolidInput(input:SolidWireInput):SolidInput {
  return input.kind==='mesh-boolean'?{...input,a:decodeSolidMesh(input.a),b:decodeSolidMesh(input.b)}:input;
}
export function solidInputTransfer(input:SolidWireInput):Transferable[] {
  return input.kind==='mesh-boolean'?[input.a.positions.buffer as ArrayBuffer,input.b.positions.buffer as ArrayBuffer]:[];
}
