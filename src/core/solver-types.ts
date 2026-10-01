// Plain serializable inputs. Runtime objects and solver handles stay in the adapter.
export interface SketchPoint { id: string; x: number; y: number; fixed?: boolean }
export interface SketchLine { id: string; a: string; b: string }
export interface SketchArc { id: string; center: string; start: string; end: string }
export type SpikeConstraint =
  | { id: string; kind: 'horizontal' | 'vertical'; line: string }
  | { id: string; kind: 'length'; line: string; value: number }
  | { id: string; kind: 'radius'; arc: string; value: number }
  | { id: string; kind: 'tangent'; arc: string; line: string };
export interface SolverSketch {
  points: SketchPoint[];
  lines: SketchLine[];
  arcs: SketchArc[];
  constraints: SpikeConstraint[];
}
export interface SolverResult {
  status: 'fully-constrained' | 'under-constrained' | 'inconsistent' | 'solver-failed';
  resultCode: number;
  dof: number;
  failedConstraintIds: string[];
  // Failure never offers candidate geometry to the caller.
  points: SketchPoint[] | null;
}
