import type { SketchFeature } from './model/document.ts';
export interface SketchSolution {
  sketch:SketchFeature|null;
  status:'fully-constrained'|'under-constrained'|'inconsistent'|'solver-failed';
  dof:number;resultCode:number;failedConstraintIds:string[];
  redundantConstraintIds?:string[];
  residuals:Record<string,number>;
  toleranceMm:number;
}
export interface SketchSolveInput {sketch:SketchFeature;draggedPointId?:string}
/** Ephemeral, serializable solve evidence; never part of the saved document. */
export type SketchDiagnostics = Omit<SketchSolution, 'sketch'>;
