import { DomainError } from '../core/model/document.ts';
import type { ProjectSnapshot } from './project-session.ts';
import type { DerivedCache } from '../core/commands/project-engine.ts';
import { cross, dot, norm, sub, trianglePoints, meshMetrics, requireSolid } from '../core/geometry/mesh-metrics.ts';
import { exportBinaryStl } from '../adapters/solid/stl-spike.ts';
import { parseBinaryStl } from '../adapters/files/parse-binary-stl.ts';
import { projectFilename } from '../adapters/files/project-file.ts';
export function projectStl(snapshot:Pick<ProjectSnapshot,'document'|'busy'>,cache:DerivedCache,selectionIds:string[]) {
  if(snapshot.busy)throw new DomainError('STL_BUSY','正在计算，请等待或取消后导出');
  const feature=selectionIds.length===1?snapshot.document.features.find(f=>f.id===selectionIds[0]):undefined;
  if(!feature||feature.kind==='sketch')throw new DomainError('STL_SELECTION_REQUIRED','请只选择一个实体后导出STL');
  const mesh=cache[feature.id];if(!mesh)throw new DomainError('STL_MESH_MISSING','实体网格尚未生成，请完成重建后重试');
  if(!mesh.positions.length)throw new DomainError('STL_EMPTY','空结果不能导出STL，请选择非空实体');
  try{requireSolid(mesh);}catch(cause){throw new DomainError('STL_INVALID_MESH',`实体网格无效或不闭合：${cause instanceof Error?cause.message:String(cause)}`);}
  const source=meshMetrics(mesh),buffer=exportBinaryStl(mesh);
  try{
    const parsed=parseBinaryStl(buffer);requireSolid(parsed.mesh);const actual=meshMetrics(parsed.mesh),points=trianglePoints(parsed.mesh);
    const size=Math.max(...source.bounds!.max.map((v,i)=>v-source.bounds!.min[i]!)),tolerance=Math.max(1e-4,size*1e-5);
    if(parsed.triangles!==source.triangles||Math.abs(actual.signedVolume-source.signedVolume)/source.signedVolume>1e-4)throw new Error('STL体积/面数与实体不一致');
    for(const key of ['min','max'] as const)if(actual.bounds![key].some((v,i)=>Math.abs(v-source.bounds![key][i]!)>tolerance))throw new Error('STL包围盒与实体不一致');
    for(let i=0;i<parsed.triangles;i++){
      const face=cross(sub(points[i*3+1]!,points[i*3]!),sub(points[i*3+2]!,points[i*3]!)),normal=parsed.normals.slice(i*3,i*3+3) as [number,number,number];
      if(Math.abs(norm(normal)-1)>1e-5||dot(face,normal)/norm(face)<1-1e-5)throw new Error('STL法线与外向三角面不一致');
    }
    return{buffer,name:projectFilename(`${snapshot.document.name}-${feature.name}`,'stl'),featureId:feature.id,metrics:actual};
  }catch(cause){throw new DomainError('STL_EXPORT_INVALID',`STL精度或拓扑验证失败：${cause instanceof Error?cause.message:String(cause)}`);}
}
