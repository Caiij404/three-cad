import { DomainError } from '../core/model/document.ts';
import type { Recompute } from '../core/commands/project-engine.ts';
// Empty sketches have no equations or solid cache. Nonempty geometry must use the real future pipeline.
export const recomputeEmptySketches:Recompute=async(candidate,context)=>{
  if(context.isCancelled())throw new DomainError('STALE_TRANSACTION','空草图操作已过期');
  for(const feature of candidate.features)if(feature.kind!=='sketch'||feature.points.length||feature.entities.length||feature.constraints.length)
    throw new DomainError('GEOMETRY_PIPELINE_UNAVAILABLE','当前仅支持空草图生命周期；绘制与真实文档求解管线尚未接入');
  return {document:structuredClone(candidate),cache:{}};
};
