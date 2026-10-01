import type { SketchFeature } from './model/document.ts';
export interface SketchSolution {
  sketch:SketchFeature|null;
  status:'fully-constrained'|'under-constrained'|'inconsistent'|'solver-failed';
  dof:number;resultCode:number;failedConstraintIds:string[];
  residuals:Record<string,number>;
  toleranceMm:number;
}
export interface SketchSolveInput {sketch:SketchFeature;draggedPointId?:string}
