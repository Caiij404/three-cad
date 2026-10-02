import { DomainError } from '../core/model/document.ts';
import type { DerivedCache, DiagnosticCache, Recompute } from '../core/commands/project-engine.ts';
import type { SolidInput, TriangleMesh } from '../core/mesh-types.ts';
import { topologicalOrder } from '../core/features/dependency-graph.ts';
import { SketchRejectedError, type SketchSolver } from './sketch-recompute.ts';
export type SolidRunner = (input: SolidInput, revision: number) => Promise<TriangleMesh>;

/** Correct full DAG recomputation first; affected-branch optimization is T-302. */
export function featureRecompute(solve: SketchSolver, run: SolidRunner): Recompute {
  return async (candidate, context) => {
    const document = structuredClone(candidate), cache: DerivedCache = {}, diagnostics: DiagnosticCache = {};
    const byId = new Map(document.features.map(feature => [feature.id, feature]));
    const current = () => { if (context.isCancelled()) throw new DomainError('STALE_TRANSACTION', '旧特征重算已丢弃'); };
    for (const id of topologicalOrder(document.features)) {
      current(); const feature = byId.get(id)!;
      if (feature.kind === 'sketch') {
        if (!feature.points.length && !feature.entities.length && !feature.constraints.length) continue;
        const result = await solve({ sketch: feature }, context.baseRevision); current();
        if (!result.sketch || result.status === 'inconsistent' || result.status === 'solver-failed') throw new SketchRejectedError(feature.name, result);
        byId.set(id, result.sketch); const { sketch, ...evidence } = result; void sketch; diagnostics[id] = evidence;
      } else if (feature.kind === 'extrude') {
        const sketch = byId.get(feature.sketchId);
        if (sketch?.kind !== 'sketch') throw new DomainError('REFERENCE_TYPE', '拉伸来源必须是草图', id);
        cache[id] = await run({ kind: 'sketch-extrusion', sketch, region: feature.region, depth: feature.depth }, context.baseRevision); current();
      } else {
        const a = cache[feature.operandAId], b = cache[feature.operandBId];
        if (!a || !b) throw new DomainError('BOOLEAN_DERIVED_MISSING', '布尔需要已成功重算的A/B实体', id);
        cache[id] = await run({ kind: 'mesh-boolean', operation: feature.operation, a, b }, context.baseRevision); current();
      }
    }
    document.features = document.features.map(feature => byId.get(feature.id)!);
    return { document, cache, diagnostics };
  };
}
