import { BASE_PLANES } from '../core/geometry/plane.ts';
import type { SketchFeature } from '../core/model/document.ts';
import type { SketchSolveInput, SketchSolution } from '../core/sketch-solution.ts';
export function domainRectangle(width=40):SketchFeature {
  return {id:'rectangle',kind:'sketch',name:'真实领域矩形',visible:true,plane:structuredClone(BASE_PLANES.XY),
    points:[{id:'p0',position:[0,0]},{id:'p1',position:[32,0.5]},{id:'p2',position:[33,24]},{id:'p3',position:[0.2,23]}],
    entities:[{id:'bottom',kind:'line',startPointId:'p0',endPointId:'p1'},{id:'right',kind:'line',startPointId:'p1',endPointId:'p2'},
      {id:'top',kind:'line',startPointId:'p2',endPointId:'p3'},{id:'left',kind:'line',startPointId:'p3',endPointId:'p0'}],
    constraints:[{id:'base-fixed',kind:'fixed',refs:[{pointId:'p0'}],fixedPosition:[0,0]},
      ...(['bottom','top'] as const).map(id=>({id:`h-${id}`,kind:'horizontal' as const,refs:[{entityId:id}]})),
      ...(['right','left'] as const).map(id=>({id:`v-${id}`,kind:'vertical' as const,refs:[{entityId:id}]})),
      {id:'width',kind:'length',refs:[{entityId:'bottom'}],value:width},{id:'height',kind:'length',refs:[{entityId:'left'}],value:30}]};
}
export function domainCircle():SketchFeature {
  return {id:'circle-sketch',kind:'sketch',name:'真实圆',visible:true,plane:structuredClone(BASE_PLANES.XZ),points:[{id:'center',position:[1,2]}],
    entities:[{id:'circle',kind:'circle',centerPointId:'center',radius:8}],constraints:[{id:'center-fixed',kind:'fixed',refs:[{pointId:'center'}],fixedPosition:[0,0]},
      {id:'circle-radius',kind:'radius',refs:[{entityId:'circle'}],value:10}]};
}
export function domainArc(clockwise=false):SketchFeature {
  return {id:'arc-sketch',kind:'sketch',name:'真实圆弧',visible:true,plane:structuredClone(BASE_PLANES.YZ),
    points:[{id:'center',position:[0,0]},{id:'start',position:[10,0]},{id:'end',position:[0.5,8]}],
    entities:[{id:'arc',kind:'arc',centerPointId:'center',startPointId:'start',endPointId:'end',clockwise}],
    constraints:[{id:'center-fixed',kind:'fixed',refs:[{pointId:'center'}],fixedPosition:[0,0]},
      {id:'start-fixed',kind:'fixed',refs:[{pointId:'start'}],fixedPosition:[10,0]}]};
}
export function domainCoincident():SketchFeature {
  return {id:'coincident-sketch',kind:'sketch',name:'真实捕捉关系',visible:true,plane:structuredClone(BASE_PLANES.XY),
    points:[{id:'a',position:[0,0]},{id:'b',position:[19,0.5]},{id:'c',position:[19.1,0.3]},{id:'d',position:[27,0.1]}],
    entities:[{id:'line-a',kind:'line',startPointId:'a',endPointId:'b'},{id:'line-b',kind:'line',startPointId:'c',endPointId:'d'}],
    constraints:[{id:'fixed',kind:'fixed',refs:[{pointId:'a'}],fixedPosition:[0,0]},
      {id:'snap',kind:'coincident',refs:[{pointId:'b'},{pointId:'c'}]},
      {id:'horizontal-a',kind:'horizontal',refs:[{entityId:'line-a'}]},{id:'horizontal-b',kind:'horizontal',refs:[{entityId:'line-b'}]},
      {id:'length-a',kind:'length',refs:[{entityId:'line-a'}],value:20},{id:'length-b',kind:'length',refs:[{entityId:'line-b'}],value:10}]};
}
export function domainTangent():SketchFeature {
  const sketch=domainArc();sketch.id='tangent-sketch';sketch.name='真实领域相切';
  sketch.points.push({id:'line-end',position:[18,8.5]});sketch.entities.push({id:'tangent-line',kind:'line',startPointId:'end',endPointId:'line-end'});
  sketch.constraints.push({id:'line-horizontal',kind:'horizontal',refs:[{entityId:'tangent-line'}]},
    {id:'arc-tangent',kind:'tangent',refs:[{entityId:'arc'},{entityId:'tangent-line'}]},
    {id:'line-length',kind:'length',refs:[{entityId:'tangent-line'}],value:20});return sketch;
}
function require(condition:boolean,message:string):asserts condition {if(!condition)throw new Error(`DOMAIN_SOLVER_FIXTURE: ${message}`);}
export async function runDomainSolverFixtures(solve:(input:SketchSolveInput)=>Promise<SketchSolution>){
  const cases:Array<{id:string;input:SketchFeature;result:SketchSolution;expected:string}>=[];
  for(const [id,sketch,expectedDof] of [
    ['rectangle-40',domainRectangle(40),0],['rectangle-60',domainRectangle(60),0],['circle-radius',domainCircle(),0],
    ['arc-ccw',domainArc(),1],['arc-cw',domainArc(true),1],['coincident',domainCoincident(),0],['tangent',domainTangent(),0],
  ] as const){
    const before=JSON.stringify(sketch),result=await solve({sketch});require(result.sketch!==null,`${id} rejected`);
    require(result.dof===expectedDof,`${id}: expected DOF ${expectedDof}, got ${result.dof}`);require(JSON.stringify(sketch)===before,`${id} mutated input`);
    require(JSON.stringify(result.sketch.entities.map(e=>[e.id,e.kind]))===JSON.stringify(sketch.entities.map(e=>[e.id,e.kind])),`${id} changed entity IDs`);
    require(JSON.stringify(result.sketch.points.map(p=>p.id))===JSON.stringify(sketch.points.map(p=>p.id)),`${id} changed point IDs`);
    for(const value of Object.values(result.residuals))require(Number.isFinite(value)&&value<=1e-5,`${id}: residual ${value}`);
    if(id==='circle-radius')require(result.sketch.entities[0]?.kind==='circle'&&Math.abs(result.sketch.entities[0].radius-10)<=1e-5,'circle radius incorrect');
    cases.push({id,input:sketch,result,expected:`native DOF ${expectedDof}, unchanged IDs, independent residual ≤1e-5`});
  }
  const freeCircle=domainCircle();freeCircle.constraints=[];const freeResult=await solve({sketch:freeCircle});
  require(freeResult.sketch!==null&&freeResult.dof===3&&freeResult.status==='under-constrained','free circle DOF 3');
  require(freeResult.sketch.entities[0]?.kind==='circle'&&Math.abs(freeResult.sketch.entities[0].radius-8)<=1e-5,'free circle radius unchanged');
  cases.push({id:'free-circle',input:freeCircle,result:freeResult,expected:'native DOF 3, initial radius 8 retained'});
  const pointDistance=domainCoincident();pointDistance.entities=[];pointDistance.points=pointDistance.points.slice(0,2);
  pointDistance.constraints=[{id:'distance-fixed',kind:'fixed',refs:[{pointId:'a'}],fixedPosition:[0,0]},
    {id:'point-distance',kind:'distance',refs:[{pointId:'a'},{pointId:'b'}],value:10}];
  const distanceResult=await solve({sketch:pointDistance});require(distanceResult.sketch!==null&&distanceResult.dof===1&&distanceResult.residuals['point-distance']!<=1e-5,'point distance DOF/residual');
  cases.push({id:'point-distance',input:pointDistance,result:distanceResult,expected:'native DOF 1, point distance 10 mm'});
  const inconsistent=domainRectangle();inconsistent.constraints.push({id:'conflict-width',kind:'length',refs:[{entityId:'bottom'}],value:50});
  const failure=await solve({sketch:inconsistent});require(failure.status==='inconsistent'&&failure.sketch===null&&failure.failedConstraintIds.includes('width')&&failure.failedConstraintIds.includes('conflict-width'),'conflict must reject candidate and return real IDs');
  cases.push({id:'conflict',input:inconsistent,result:failure,expected:'inconsistent, no candidate, both width constraint IDs'});
  const under=domainRectangle();under.constraints=under.constraints.filter(c=>c.id!=='width');const result=await solve({sketch:under});require(result.status==='under-constrained'&&result.dof===1,'width removal DOF');
  cases.push({id:'width-removed',input:under,result,expected:'real DOF 1'});
  const dragged=domainCoincident();dragged.constraints=dragged.constraints.filter(c=>c.kind==='coincident');dragged.points[1]!.position=[30,5];
  const dragResult=await solve({sketch:dragged,draggedPointId:'b'});require(dragResult.sketch!==null&&dragResult.residuals.snap!<=1e-5,'dragged coincident result');
  cases.push({id:'drag-hint',input:dragged,result:dragResult,expected:'markDragged hint, coincident residual ≤1e-5; not a full gesture test'});
  return cases;
}
