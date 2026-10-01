import { DomainError, type SketchFeature, type Vec2 } from '../model/document.ts';
import { entityPointIds } from './drawing.ts';
import type { SketchPreview } from './drawing.ts';

/** Remove only points owned by removed entities and no longer used by a retained entity. */
export function deleteSketchEntities(sketch:SketchFeature,ids:string[]):SketchFeature {
  const removed=new Set(ids);if(!removed.size)throw new DomainError('SELECTION_REQUIRED','请至少选择一个草图实体');
  if(ids.some(id=>!sketch.entities.some(e=>e.id===id)))throw new DomainError('ENTITY_REQUIRED','只能删除当前草图的线、圆或圆弧');
  const result=structuredClone(sketch),owned=new Set(result.entities.filter(e=>removed.has(e.id)).flatMap(entityPointIds));
  result.entities=result.entities.filter(e=>!removed.has(e.id));
  const retained=new Set(result.entities.flatMap(entityPointIds)),orphaned=new Set([...owned].filter(id=>!retained.has(id)));
  result.points=result.points.filter(p=>!orphaned.has(p.id));
  result.constraints=result.constraints.filter(c=>c.refs.every(r=>'entityId' in r?!removed.has(r.entityId):!orphaned.has(r.pointId)));
  return result;
}
export function moveSketchPoint(sketch:SketchFeature,pointId:string,position:Vec2):SketchFeature {
  if(position.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))throw new DomainError('INVALID_COORDINATE','拖动坐标需有限且在 ±10000 mm 内');
  const result=structuredClone(sketch),point=result.points.find(p=>p.id===pointId);
  if(!point)throw new DomainError('REFERENCE_MISSING','拖动点不属于当前草图');point.position=[...position];return result;
}
/** Reject solved degeneracy; the solver's residual alone does not prove a usable entity. */
export function requireDrawableSketch(sketch:SketchFeature):void {
  const points=new Map(sketch.points.map(p=>[p.id,p.position])),distance=(a:string,b:string)=>{const p=points.get(a)!,q=points.get(b)!;return Math.hypot(p[0]-q[0],p[1]-q[1]);};
  for(const e of sketch.entities){
    if(e.kind==='line'&&distance(e.startPointId,e.endPointId)<=1e-6)throw new DomainError('DEGENERATE_GEOMETRY','求解后出现零长度线，候选已拒绝');
    if(e.kind==='circle'&&e.radius<=1e-6)throw new DomainError('DEGENERATE_GEOMETRY','求解后圆半径过小，候选已拒绝');
    if(e.kind==='arc'&&(distance(e.centerPointId,e.startPointId)<=1e-6||distance(e.startPointId,e.endPointId)<=1e-6))throw new DomainError('DEGENERATE_GEOMETRY','求解后圆弧端点或半径退化，候选已拒绝');
  }
}
export function sketchPreview(sketch:SketchFeature):SketchPreview {
  const points=new Map(sketch.points.map(p=>[p.id,p.position]));
  const lines=sketch.entities.map(e=>{
    if(e.kind==='line')return [points.get(e.startPointId)!,points.get(e.endPointId)!];
    const center=points.get(e.centerPointId)!;let start=0,sweep=2*Math.PI,radius:number;
    if(e.kind==='circle')radius=e.radius;
    else{const a=points.get(e.startPointId)!,b=points.get(e.endPointId)!;radius=Math.hypot(a[0]-center[0],a[1]-center[1]);start=Math.atan2(a[1]-center[1],a[0]-center[0]);sweep=((Math.atan2(b[1]-center[1],b[0]-center[0])-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);if(e.clockwise)sweep-=2*Math.PI;}
    const count=Math.max(24,Math.ceil(Math.abs(sweep)/(Math.PI/64)));
    return Array.from({length:count+1},(_,i)=>[center[0]+radius*Math.cos(start+sweep*i/count),center[1]+radius*Math.sin(start+sweep*i/count)] as Vec2);
  });return {lines,points:sketch.points.map(p=>p.position)};
}
