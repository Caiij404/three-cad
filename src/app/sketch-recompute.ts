import type { DiagnosticCache, Recompute } from '../core/commands/project-engine.ts';
import { DomainError } from '../core/model/document.ts';
import type { SketchSolveInput, SketchSolution } from '../core/sketch-solution.ts';
export type SketchSolver=(input:SketchSolveInput,revision:number)=>Promise<SketchSolution>;
/** T-104 document pipeline supports sketch-only documents. Solids require the later general feature pipeline. */
export function sketchRecompute(solve:SketchSolver):Recompute {
  return async(candidate,context)=>{
    const document=structuredClone(candidate),diagnostics:DiagnosticCache={};
    for(let i=0;i<document.features.length;i++){
      if(context.isCancelled())throw new DomainError('STALE_TRANSACTION','领域求解事务已过期');
      const feature=document.features[i]!;
      if(feature.kind!=='sketch')throw new DomainError('SOLID_PIPELINE_UNAVAILABLE','实体后代重算管线等待 T-202/302');
      if(!feature.points.length&&!feature.entities.length&&!feature.constraints.length)continue;
      const result=await solve({sketch:feature},context.baseRevision);
      if(context.isCancelled())throw new DomainError('STALE_TRANSACTION','旧求解结果已丢弃');
      if(!result.sketch||result.status==='inconsistent'||result.status==='solver-failed')throw new DomainError('SOLVER_REJECTED',`${feature.name}：${result.status}，约束 ${result.failedConstraintIds.join(', ')||'无可读冲突集合'}`);
      document.features[i]=result.sketch;
      const {sketch:solved,...evidence}=result;
      void solved;diagnostics[feature.id]=evidence;
    }
    return {document,cache:{},diagnostics};
  };
}
