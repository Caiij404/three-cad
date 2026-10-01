// Derived mesh data only; no scene objects or WASM handles are part of this contract.
export type Vec3 = [number, number, number];
export interface TriangleMesh { positions: number[] }
export type BooleanOperation = 'union' | 'subtract' | 'intersect';
export interface BoxInput { center: Vec3; size: Vec3 }
export type SolidInput =
  | { kind: 'boolean'; operation: BooleanOperation; a: BoxInput; b: BoxInput }
  | { kind: 'hole-extrusion'; plane: 'XY' | 'XZ' | 'YZ'; depth: number };
