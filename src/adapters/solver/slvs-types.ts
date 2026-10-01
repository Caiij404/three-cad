// A narrow description of the pinned C/Embind API; no Vue or domain coupling.
export interface SlvsEntity {
  h: number; group: number; type: number; wrkpl: number;
  point: [number, number, number, number]; normal: number; distance: number;
  param: [number, number, number, number];
}
export interface SlvsConstraint { h: number }
export interface SlvsModule {
  RESULT_OKAY: number;
  RESULT_REDUNDANT_OKAY: number;
  RESULT_INCONSISTENT: number;
  E_NONE: SlvsEntity;
  HEAPU8: Uint8Array;
  addBase2D(group: number): SlvsEntity;
  addNormal3D(group: number, w: number, x: number, y: number, z: number): SlvsEntity;
  addPoint2D(group: number, x: number, y: number, plane: SlvsEntity): SlvsEntity;
  addLine2D(group: number, a: SlvsEntity, b: SlvsEntity, plane: SlvsEntity): SlvsEntity;
  addArc(group: number, normal: SlvsEntity, center: SlvsEntity, start: SlvsEntity, end: SlvsEntity, plane: SlvsEntity): SlvsEntity;
  horizontal(group: number, line: SlvsEntity, plane: SlvsEntity, none: SlvsEntity): SlvsConstraint;
  vertical(group: number, line: SlvsEntity, plane: SlvsEntity, none: SlvsEntity): SlvsConstraint;
  distance(group: number, a: SlvsEntity, b: SlvsEntity, value: number, plane: SlvsEntity): SlvsConstraint;
  diameter(group: number, arc: SlvsEntity, value: number): SlvsConstraint;
  tangent(group: number, arc: SlvsEntity, line: SlvsEntity, plane: SlvsEntity): SlvsConstraint;
  getParamValue(handle: number): number;
  solveSketch(group: number, calculateFaileds: boolean): { result: number; dof: number; nbad: number; bad?: Uint32Array };
  clearSketch(): void;
}
export type SlvsFactory = (options?: { locateFile?: (file: string) => string; print?: (text: string) => void; printErr?: (text: string) => void }) => Promise<SlvsModule>;
