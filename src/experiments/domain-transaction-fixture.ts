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
  await engine.execute({kind:'add-feature',feature:domainRectangle()});const initialWidth=width(),before=JSON.stringify(engine.document),history=engine.historyLength,diagnosticBefore=JSON.stringify(engine.diagnostics);
  const conflict=domainRectangle();conflict.constraints.push({id:'conflict-width',kind:'length',refs:[{entityId:'bottom'}],value:50});
  let rejected=false;
  try{await engine.execute({kind:'replace-feature',feature:conflict});}catch(cause){if(cause instanceof Error&&'code' in cause&&cause.code==='SOLVER_REJECTED')rejected=true;else throw cause;}
  if(!rejected||JSON.stringify(engine.document)!==before||engine.historyLength!==history||JSON.stringify(engine.diagnostics)!==diagnosticBefore)throw new Error('Real domain conflict did not preserve document/history/diagnostics');
  await engine.execute({kind:'replace-feature',feature:domainRectangle(60)});const changedWidth=width();engine.undo();const undoWidth=width();engine.redo();const redoWidth=width();
  const actual=[initialWidth,changedWidth,undoWidth,redoWidth],expected=[40,60,40,60];
  if(actual.some((value,index)=>Math.abs(value-expected[index]!)>1e-5))throw new Error('Real domain transaction dimensions incorrect');
  const free=engine.document.features[0]!;if(free.kind!=='sketch')throw new Error('Expected sketch');
  free.constraints=free.constraints.filter(c=>c.id!=='width');await engine.execute({kind:'replace-feature',feature:free});
  const freeDiagnostics=JSON.stringify(engine.diagnostics),dofs=[engine.diagnostics.rectangle!.dof];
  const held=engine.document.features[0]!;if(held.kind!=='sketch')throw new Error('Expected sketch');
  const p=held.points.find(p=>p.id==='p1')!;held.constraints.push({id:'endpoint-fixed',kind:'fixed',refs:[{pointId:p.id}],fixedPosition:p.position});
  await engine.execute({kind:'replace-feature',feature:held});const heldDiagnostics=JSON.stringify(engine.diagnostics);dofs.push(engine.diagnostics.rectangle!.dof);
  engine.undo();if(JSON.stringify(engine.diagnostics)!==freeDiagnostics)throw new Error('Diagnostic undo mismatch');dofs.push(engine.diagnostics.rectangle!.dof);
  engine.redo();if(JSON.stringify(engine.diagnostics)!==heldDiagnostics)throw new Error('Diagnostic redo mismatch');dofs.push(engine.diagnostics.rectangle!.dof);
  if(JSON.stringify(dofs)!==JSON.stringify([1,0,1,0])||!engine.diagnostics.rectangle!.redundantConstraintIds?.includes('h-bottom'))throw new Error('Actual DOF or redundancy mismatch');
  return {actualWidthsMm:actual,expectedWidthsMm:expected,toleranceMm:1e-5,conflictRejected:true,conflictDocumentHistoryUnchanged:true,
    conflictDiagnosticsUnchanged:true,diagnosticDofs:dofs,diagnosticUndoRedoExact:true,redundantAccepted:engine.diagnostics.rectangle,
    historyLength:engine.historyLength,revision:engine.revision,featureId:engine.document.features[0]!.id,passed:true};
}
