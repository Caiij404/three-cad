export type Id = string;
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export interface PlaneFrame { origin: Vec3; u: Vec3; v: Vec3 }
export interface Point2D { id: Id; position: Vec2 }
export type Entity =
  | { id: Id; kind: 'line'; startPointId: Id; endPointId: Id }
  | { id: Id; kind: 'circle'; centerPointId: Id; radius: number }
  | { id: Id; kind: 'arc'; centerPointId: Id; startPointId: Id; endPointId: Id; clockwise: boolean };
export type EntityRef = { entityId: Id } | { pointId: Id };
export interface Constraint {
  id: Id;
  kind: 'coincident' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'distance'
    | 'length' | 'angle' | 'radius' | 'equal' | 'tangent' | 'fixed';
  refs: EntityRef[];
  value?: number; // distance/length/radius: mm; angle: radians in (0, π)
  fixedPosition?: Vec2;
}
export interface FeatureBase { id: Id; name: string; visible: boolean }
export interface SketchFeature extends FeatureBase {
  kind: 'sketch'; plane: PlaneFrame; points: Point2D[]; entities: Entity[]; constraints: Constraint[];
}
export interface ExtrudeFeature extends FeatureBase {
  kind: 'extrude'; sketchId: Id; region: { outerEntityIds: Id[]; holeEntityIds: Id[][] }; depth: number;
}
export interface BooleanFeature extends FeatureBase {
  kind: 'boolean'; operation: 'union' | 'subtract' | 'intersect'; operandAId: Id; operandBId: Id;
}
export type Feature = SketchFeature | ExtrudeFeature | BooleanFeature;
export interface ProjectDocument {
  schemaVersion: 1; id: Id; name: string; units: 'mm'; features: Feature[];
  view: { position: Vec3; target: Vec3; up: Vec3; projection: 'orthographic'; zoom: number };
  createdAt: string; updatedAt: string;
}
export class DomainError extends Error {
  readonly code: string;
  readonly path: string;
  constructor(code: string, message: string, path = '') {
    super(message); this.name='DomainError';this.code=code;this.path=path;
  }
}
export function createEmptyProject(options: {id?:string;name?:string;now?:string}={}):ProjectDocument {
  const now=options.now ?? new Date().toISOString();
  return {schemaVersion:1,id:options.id ?? crypto.randomUUID(),name:options.name ?? '未命名项目',units:'mm',features:[],
    view:{position:[100,-100,100],target:[0,0,0],up:[0,0,1],projection:'orthographic',zoom:1},createdAt:now,updatedAt:now};
}
export function documentIds(document:ProjectDocument):string[] {
  return [document.id,...document.features.flatMap(feature=>[feature.id,...(feature.kind==='sketch'
    ? [...feature.points,...feature.entities,...feature.constraints].map(item=>item.id):[])])];
}
