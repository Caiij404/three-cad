import { ProjectEngine } from '../core/commands/project-engine.ts';
import { createEmptyProject } from '../core/model/document.ts';
import { sketchRecompute, type SketchSolver } from '../app/sketch-recompute.ts';
import { domainRectangle } from './domain-solver-fixtures.ts';
export async function runDomainTransactionFixture(solve:SketchSolver){
  const engine=new ProjectEngine(createEmptyProject(),{recompute:sketchRecompute(solve)});
  const width=()=>{
    const sketch=engine.document.features[0]!;if(sketch.kind!=='sketch')throw new Error('Expected sketch');
    const a=sketch.points.find(p=>p.id==='p0')!.position,b=sketch.points.find(p=>p.id==='p1')!.position;return Math.hypot(b[0]-a[0],b[1]-a[1]);
  };
  await engine.execute({kind:'add-feature',feature:domainRectangle()});const initialWidth=width(),before=JSON.stringify(engine.document),history=engine.historyLength;
  const conflict=domainRectangle();conflict.constraints.push({id:'conflict-width',kind:'length',refs:[{entityId:'bottom'}],value:50});
  let rejected=false;
  try{await engine.execute({kind:'replace-feature',feature:conflict});}catch(cause){if(cause instanceof Error&&'code' in cause&&cause.code==='SOLVER_REJECTED')rejected=true;else throw cause;}
  if(!rejected||JSON.stringify(engine.document)!==before||engine.historyLength!==history)throw new Error('Real domain conflict did not preserve document/history');
  await engine.execute({kind:'replace-feature',feature:domainRectangle(60)});const changedWidth=width();engine.undo();const undoWidth=width();engine.redo();const redoWidth=width();
  const actual=[initialWidth,changedWidth,undoWidth,redoWidth],expected=[40,60,40,60];
  if(actual.some((value,index)=>Math.abs(value-expected[index]!)>1e-5))throw new Error('Real domain transaction dimensions incorrect');
  return {actualWidthsMm:actual,expectedWidthsMm:expected,toleranceMm:1e-5,conflictRejected:true,conflictDocumentHistoryUnchanged:true,
    historyLength:engine.historyLength,revision:engine.revision,featureId:engine.document.features[0]!.id,passed:true};
}
