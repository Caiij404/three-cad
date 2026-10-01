import { createEmptyProject, DomainError, type Constraint, type Entity, type SketchFeature, type Vec2 } from '../../core/model/document.ts';
import { validateDocument } from '../../core/model/validate-document.ts';
import { requireDrawableSketch } from '../../core/geometry/sketch-edit.ts';
import { measureTangency, tangentContactGuess } from '../../core/geometry/tangency.ts';
import type { SketchSolution, SketchSolveInput } from '../../core/sketch-solution.ts';
import type { SlvsEntity, SlvsModule } from './slvs-types.ts';
const tolerance=1e-5;
const supported=new Set<Constraint['kind']>(['fixed','coincident','horizontal','vertical','length','distance','radius','tangent','parallel','perpendicular','angle','equal']);
const distance=(a:Vec2,b:Vec2)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function checked(input:SketchSolveInput):SketchFeature {
  if(!input||!input.sketch)throw new DomainError('INVALID_SOLVER_INPUT','缺少领域草图');
  const document=createEmptyProject();document.features=[input.sketch];validateDocument(document);
  const sketch=input.sketch;
  if(sketch.points.length+sketch.entities.length+sketch.constraints.length+6*sketch.constraints.filter(c=>c.kind==='tangent').length>2000)throw new DomainError('SOLVER_CAPACITY','当前求解含相切辅助元素最多 2000 个元素');
  if(input.draggedPointId&&!sketch.points.some(p=>p.id===input.draggedPointId))throw new DomainError('REFERENCE_MISSING','拖动点不属于草图');
  const entities=new Map(sketch.entities.map(e=>[e.id,e]));
  for(const c of sketch.constraints){
    if(!supported.has(c.kind))throw new DomainError('CONSTRAINT_UNAVAILABLE',`${c.kind} 等待 T-201 完整约束适配`);
    if(c.kind==='tangent'){
      const refs=c.refs.map(r=>entities.get('entityId' in r?r.entityId:''));
      tangentContactGuess(sketch,refs[0]!,refs[1]!);
    }
  }
  return structuredClone(sketch);
}
/** Independent residuals from returned doubles, including the arc's inherent equal-radius relation. */
export function sketchResiduals(sketch:SketchFeature):Record<string,number> {
  const points=new Map(sketch.points.map(p=>[p.id,p.position])),entities=new Map(sketch.entities.map(e=>[e.id,e]));
  const point=(id:string)=>points.get(id)!;
  const entity=(c:Constraint,index=0)=>entities.get('entityId' in c.refs[index]!?c.refs[index]!.entityId:'')!;
  const refPoint=(c:Constraint,index=0)=>point('pointId' in c.refs[index]!?c.refs[index]!.pointId:'');
  const curveRadius=(e:Entity)=>e.kind==='circle'?e.radius:e.kind==='arc'?distance(point(e.centerPointId),point(e.startPointId)):NaN;
  const lineVector=(e:Entity):Vec2=>{if(e.kind!=='line')throw new DomainError('REFERENCE_TYPE','约束需要直线');const a=point(e.startPointId),b=point(e.endPointId);return [b[0]-a[0],b[1]-a[1]];};
  const angle=(a:Vec2,b:Vec2)=>Math.atan2(Math.abs(a[0]*b[1]-a[1]*b[0]),a[0]*b[0]+a[1]*b[1]);
  const residuals:Record<string,number>={};
  for(const e of sketch.entities)if(e.kind==='arc')residuals[`arc:${e.id}`]=Math.abs(distance(point(e.centerPointId),point(e.startPointId))-distance(point(e.centerPointId),point(e.endPointId)));
  for(const c of sketch.constraints){
    const e=entity(c);let residual:number;
    switch(c.kind){
      case 'fixed':residual=distance(refPoint(c),c.fixedPosition!);break;
      case 'coincident':residual=distance(refPoint(c),refPoint(c,1));break;
      case 'horizontal':residual=Math.abs(point((e as Extract<Entity,{kind:'line'}>).startPointId)[1]-point((e as Extract<Entity,{kind:'line'}>).endPointId)[1]);break;
      case 'vertical':residual=Math.abs(point((e as Extract<Entity,{kind:'line'}>).startPointId)[0]-point((e as Extract<Entity,{kind:'line'}>).endPointId)[0]);break;
      case 'length':{const line=e as Extract<Entity,{kind:'line'}>;residual=Math.abs(distance(point(line.startPointId),point(line.endPointId))-c.value!);break;}
      case 'distance':residual=Math.abs(distance(refPoint(c),refPoint(c,1))-c.value!);break;
      case 'radius':residual=Math.abs(curveRadius(e)-c.value!);break;
      case 'parallel':{const theta=angle(lineVector(e),lineVector(entity(c,1)));residual=Math.min(theta,Math.PI-theta);break;}
      case 'perpendicular':residual=Math.abs(angle(lineVector(e),lineVector(entity(c,1)))-Math.PI/2);break;
      case 'angle':residual=Math.abs(angle(lineVector(e),lineVector(entity(c,1)))-c.value!);break;
      case 'equal':{const other=entity(c,1);residual=e.kind==='line'&&other.kind==='line'?Math.abs(distance(point(e.startPointId),point(e.endPointId))-distance(point(other.startPointId),point(other.endPointId))):Math.abs(curveRadius(e)-curveRadius(other));break;}
      case 'tangent':{
        residual=measureTangency(sketch,e,entity(c,1),tolerance).residualMm;break;
      }
      default:throw new DomainError('CONSTRAINT_UNAVAILABLE',`未实现 ${c.kind} 残差`);
    }
    residuals[c.id]=residual;
  }
  return residuals;
}
export function solveDomainSketch(module:SlvsModule,input:SketchSolveInput):SketchSolution {
  const sketch=checked(input);
  const fixed=new Map<string,Vec2>();
  for(const c of sketch.constraints)if(c.kind==='fixed'){
    const id='pointId' in c.refs[0]!?c.refs[0]!.pointId:'';
    if(fixed.has(id)&&distance(fixed.get(id)!,c.fixedPosition!)>tolerance)throw new DomainError('FIXED_CONFLICT','同一点有冲突 fixed 输入');
    fixed.set(id,c.fixedPosition!);
  }
  module.clearSketch();
  try{
    const plane=module.addBase2D(1),normal=module.addNormal3D(1,1,0,0,0),points=new Map<string,SlvsEntity>(),entities=new Map<string,SlvsEntity>(),radii=new Map<string,SlvsEntity>(),handles=new Map<number,string>();
    for(const p of sketch.points){const position=fixed.get(p.id)??p.position;points.set(p.id,module.addPoint2D(fixed.has(p.id)?1:2,position[0],position[1],plane));}
    for(const e of sketch.entities){
      if(e.kind==='line')entities.set(e.id,module.addLine2D(2,points.get(e.startPointId)!,points.get(e.endPointId)!,plane));
      else if(e.kind==='arc'){
        // SolveSpace arcs are counterclockwise. Swap native endpoints for a clockwise domain arc, retaining IDs.
        const start=e.clockwise?e.endPointId:e.startPointId,end=e.clockwise?e.startPointId:e.endPointId;
        entities.set(e.id,module.addArc(2,normal,points.get(e.centerPointId)!,points.get(start)!,points.get(end)!,plane));
      }else{
        const radius=module.addDistance(2,e.radius,plane);radii.set(e.id,radius);entities.set(e.id,module.addCircle(2,normal,points.get(e.centerPointId)!,radius,plane));
      }
    }
    const ref=(c:Constraint,i:number)=>{const r=c.refs[i]!;return 'pointId' in r?points.get(r.pointId)!:entities.get(r.entityId)!;};
    for(const c of sketch.constraints){
      let handle:number;
      switch(c.kind){
        case 'fixed':continue;
        case 'coincident':handle=module.coincident(2,ref(c,0),ref(c,1),plane).h;break;
        case 'horizontal':handle=module.horizontal(2,ref(c,0),plane,module.E_NONE).h;break;
        case 'vertical':handle=module.vertical(2,ref(c,0),plane,module.E_NONE).h;break;
        case 'distance':handle=module.distance(2,ref(c,0),ref(c,1),c.value!,plane).h;break;
        case 'length':{
          const id='entityId' in c.refs[0]!?c.refs[0]!.entityId:'';const line=sketch.entities.find(e=>e.id===id) as Extract<Entity,{kind:'line'}>;
          handle=module.distance(2,points.get(line.startPointId)!,points.get(line.endPointId)!,c.value!,plane).h;break;
        }
        case 'radius':handle=module.diameter(2,ref(c,0),c.value!*2).h;break;
        case 'parallel':handle=module.parallel(2,ref(c,0),ref(c,1),plane).h;break;
        case 'perpendicular':handle=module.perpendicular(2,ref(c,0),ref(c,1),plane,false).h;break;
        case 'angle':handle=module.angle(2,ref(c,0),ref(c,1),c.value!*180/Math.PI,plane,false).h;break;
        case 'equal':handle=module.equal(2,ref(c,0),ref(c,1),plane).h;break;
        case 'tangent':{
          const pair=c.refs.map(r=>sketch.entities.find(e=>e.id===('entityId' in r?r.entityId:''))!);
          const arc=pair.find(e=>e.kind==='arc'),line=pair.find(e=>e.kind==='line');
          if(arc?.kind==='arc'&&line?.kind==='line'&&[arc.startPointId,arc.endPointId].some(id=>id===line.startPointId||id===line.endPointId)){
            handle=module.tangent(2,entities.get(arc.id)!,entities.get(line.id)!,plane).h;break;
          }
          const guess=tangentContactGuess(sketch,pair[0]!,pair[1]!),contact=module.addPoint2D(2,guess[0],guess[1],plane),none=module.E_NONE;
          const on=(type:number,target:SlvsEntity)=>{const constraint=module.addConstraint(2,type,plane,0,contact,none,target,none,none,none,false,false);handles.set(constraint.h,c.id);};
          const radial:SlvsEntity[]=[];
          for(const e of pair)if(e.kind!=='line'){
            on(module.C_PT_ON_CIRCLE,entities.get(e.id)!);
            radial.push(module.addLine2D(2,points.get(e.centerPointId)!,contact,plane));
          }
          if(line){on(module.C_PT_ON_LINE,entities.get(line.id)!);handle=module.perpendicular(2,radial[0]!,entities.get(line.id)!,plane,false).h;}
          else handle=module.parallel(2,radial[0]!,radial[1]!,plane).h;
          break;
        }
        default:throw new DomainError('CONSTRAINT_UNAVAILABLE',`不支持 ${c.kind}`);
      }
      handles.set(handle,c.id);
    }
    if(input.draggedPointId&&!fixed.has(input.draggedPointId))module.markDragged(points.get(input.draggedPointId)!);
    const raw=module.solveSketch(2,true),accepted=raw.result===module.RESULT_OKAY||raw.result===module.RESULT_REDUNDANT_OKAY;
    const failed=Array.from(raw.bad??[],handle=>{const id=handles.get(handle);if(!id)throw new DomainError('SOLVER_PROTOCOL','未知失败约束 handle');return id;});
    if(raw.nbad!==failed.length||!Number.isInteger(raw.dof))throw new DomainError('SOLVER_PROTOCOL','非法 DOF/失败列表');
    const failedConstraintIds=[...new Set(failed)];
    const status=accepted?(raw.dof===0?'fully-constrained':'under-constrained'):raw.result===module.RESULT_INCONSISTENT?'inconsistent':'solver-failed';
    if(!accepted)return {sketch:null,status,dof:raw.dof,resultCode:raw.result,failedConstraintIds,residuals:{},toleranceMm:tolerance};
    for(const p of sketch.points){const native=points.get(p.id)!;p.position=[module.getParamValue(native.param[0]),module.getParamValue(native.param[1])];}
    for(const e of sketch.entities)if(e.kind==='circle')e.radius=module.getParamValue(radii.get(e.id)!.param[0]);
    const document=createEmptyProject();document.features=[sketch];validateDocument(document);
    requireDrawableSketch(sketch);
    const residuals=sketchResiduals(sketch);
    for(const [id,error] of Object.entries(residuals))if(!Number.isFinite(error)||error>tolerance)throw new DomainError('SOLVER_RESIDUAL',`${id} 残差 ${error} 超出 ${tolerance}`);
    return {sketch,status,dof:raw.dof,resultCode:raw.result,failedConstraintIds,residuals,toleranceMm:tolerance};
  }finally{module.clearSketch();}
}
