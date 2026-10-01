import { BASE_PLANES } from '../core/geometry/plane.ts';
import type { Constraint, SketchFeature, Vec2 } from '../core/model/document.ts';
import type { SketchSolveInput, SketchSolution } from '../core/sketch-solution.ts';
import { ProjectEngine } from '../core/commands/project-engine.ts';
import { createEmptyProject } from '../core/model/document.ts';
import { sketchRecompute } from '../app/sketch-recompute.ts';
const fixed=(id:string,position:Vec2):Constraint=>({id:`fixed-${id}`,kind:'fixed',refs:[{pointId:id}],fixedPosition:position});
function base(id:string):SketchFeature{return {id,kind:'sketch',name:id,visible:true,plane:BASE_PLANES.XY,points:[],entities:[],constraints:[]};}
export function linePair(kind:'parallel'|'perpendicular'|'angle'|'equal',degrees=60,reversed=false):SketchFeature {
  const sketch=base(`${kind}-${degrees}-${reversed}`),anchor:Vec2=[0,20],end:Vec2=kind==='perpendicular'?[2,28]:degrees>90?[-5,28]:[8,23];
  sketch.points=[{id:'a',position:[0,0]},{id:'b',position:[10,0]},{id:'c',position:anchor},{id:'d',position:end}];
  sketch.entities=[{id:'line-a',kind:'line',startPointId:reversed?'b':'a',endPointId:reversed?'a':'b'},{id:'line-b',kind:'line',startPointId:'c',endPointId:'d'}];
  sketch.constraints=[fixed('a',[0,0]),fixed('b',[10,0]),fixed('c',anchor),{id:'relation',kind,refs:[{entityId:'line-a'},{entityId:'line-b'}],...(kind==='angle'?{value:degrees*Math.PI/180}:{})},
    kind==='equal'?{id:'direction',kind:'horizontal',refs:[{entityId:'line-b'}]}:{id:'length',kind:'length',refs:[{entityId:'line-b'}],value:10}];return sketch;
}
export function equalCurves(a:'circle'|'arc',b:'circle'|'arc'):SketchFeature {
  const sketch=base(`equal-${a}-${b}`);
  for(const [index,kind] of [a,b].entries()){
    const center:Vec2=[index*30,0],centerId=`center-${index}`,id=`curve-${index}`;sketch.points.push({id:centerId,position:center});sketch.constraints.push(fixed(centerId,center));
    if(kind==='circle')sketch.entities.push({id,kind,centerPointId:centerId,radius:index?7:10});
    else{const radius=index?7:10;sketch.points.push({id:`start-${index}`,position:[center[0]+radius,0]},{id:`end-${index}`,position:[center[0],radius]});sketch.entities.push({id,kind,centerPointId:centerId,startPointId:`start-${index}`,endPointId:`end-${index}`,clockwise:index===1});}
  }
  sketch.constraints.push({id:'radius',kind:'radius',refs:[{entityId:'curve-0'}],value:10},{id:'relation',kind:'equal',refs:[{entityId:'curve-0'},{entityId:'curve-1'}]});return sketch;
}
export function linearConstraintCases():SketchFeature[]{return [linePair('parallel'),linePair('parallel',60,true),linePair('perpendicular'),...([30,60,120,170] as const).map(angle=>linePair('angle',angle)),linePair('angle',60,true),linePair('equal'),equalCurves('circle','circle'),equalCurves('circle','arc'),equalCurves('arc','arc')];}
export async function runLinearConstraintFixtures(solve:(input:SketchSolveInput)=>Promise<SketchSolution>){
  const cases=[];
  for(const sketch of linearConstraintCases()){
    const before=JSON.stringify(sketch),result=await solve({sketch});if(!result.sketch)throw new Error(`${sketch.name}: native ${result.status}`);
    if(JSON.stringify(sketch)!==before)throw new Error('Mutated fixture input');
    for(const residual of Object.values(result.residuals))if(!Number.isFinite(residual)||residual>1e-5)throw new Error(`${sketch.name}: residual ${residual}`);
    const definition=(s:SketchFeature)=>s.entities.map(e=>e.kind==='circle'?{...e,radius:0}:e);
    if(JSON.stringify(definition(result.sketch))!==JSON.stringify(definition(sketch)))throw new Error('Entity IDs/definitions changed');
    if(JSON.stringify(result.sketch.points.map(p=>p.id))!==JSON.stringify(sketch.points.map(p=>p.id)))throw new Error('Point IDs changed');
    const relation=sketch.constraints.find(c=>c.id==='relation')!;
    cases.push({id:sketch.id,input:sketch,result,expected:`${relation.kind}: independent residual ≤1e-5 ${['angle','parallel','perpendicular'].includes(relation.kind)?'rad':'mm'}; stable IDs and input`,...(relation.kind==='angle'?{domainRadians:relation.value,nativeDegrees:relation.value!*180/Math.PI}:{}),passed:true});
  }return cases;
}
export async function runAngleTransactionFixture(solve:(input:SketchSolveInput,revision:number)=>Promise<SketchSolution>){
  const engine=new ProjectEngine(createEmptyProject(),{recompute:sketchRecompute(solve)}),initial=linePair('angle',60);await engine.execute({kind:'add-feature',feature:initial});const before=JSON.stringify(engine.document);
  const changed=structuredClone(initial);changed.constraints.find(c=>c.id==='relation')!.value=120*Math.PI/180;await engine.execute({kind:'replace-feature',feature:changed});const after=JSON.stringify(engine.document);
  const measured=(snapshot:string)=>{const sketch=(JSON.parse(snapshot) as ReturnType<typeof createEmptyProject>).features[0] as SketchFeature;const vector=(id:string)=>{const line=sketch.entities.find(e=>e.id===id)!;if(line.kind!=='line')throw new Error('Expected line');const a=sketch.points.find(p=>p.id===line.startPointId)!.position,b=sketch.points.find(p=>p.id===line.endPointId)!.position;return [b[0]-a[0],b[1]-a[1]];};const a=vector('line-a'),b=vector('line-b');return Math.atan2(Math.abs(a[0]!*b[1]!-a[1]!*b[0]!),a[0]!*b[0]!+a[1]!*b[1]!)*180/Math.PI;};
  const values=[measured(before),measured(after)];engine.undo();if(JSON.stringify(engine.document)!==before)throw new Error('Angle undo snapshot differs');values.push(measured(JSON.stringify(engine.document)));engine.redo();if(JSON.stringify(engine.document)!==after)throw new Error('Angle redo snapshot differs');values.push(measured(JSON.stringify(engine.document)));
  values.forEach((value,i)=>{if(Math.abs(value-[60,120,60,120][i]!)*Math.PI/180>1e-5)throw new Error('Actual history angle differs');});
  const conflict=structuredClone(changed);conflict.constraints.push({id:'contradictory-angle',kind:'angle',refs:[{entityId:'line-a'},{entityId:'line-b'}],value:Math.PI/3});const history=engine.historyLength;let rejected=false,message='';
  try{await engine.execute({kind:'replace-feature',feature:conflict});}catch(cause){if(cause instanceof Error&&'code' in cause&&cause.code==='SOLVER_REJECTED'){rejected=true;message=cause.message;}else throw cause;}
  if(!rejected||JSON.stringify(engine.document)!==after||engine.historyLength!==history)throw new Error('Angle conflict did not preserve document/history');
  return {anglesDegrees:values,undoRedoExact:true,conflictDocumentHistoryUnchanged:true,nativeConflictMessage:message,before:JSON.parse(before),after:JSON.parse(after),toleranceRadians:1e-5,passed:true};
}
