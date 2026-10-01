export interface CsgVector { x: number; y: number; z: number }
export class Vertex { constructor(pos: CsgVector, normal: CsgVector); pos: CsgVector; normal: CsgVector }
export class Polygon { constructor(vertices: Vertex[]); vertices: Vertex[] }
export class CSG {
  polygons: Polygon[];
  static fromPolygons(polygons: Polygon[]): CSG;
  union(other: CSG): CSG;
  subtract(other: CSG): CSG;
  intersect(other: CSG): CSG;
}
