import { ProjectEngine, type DiagnosticCache, type ProjectCommand } from '../core/commands/project-engine.ts';
import { createEmptyProject, DomainError, type ProjectDocument, type SketchFeature } from '../core/model/document.ts';
import { sketchRecompute } from './sketch-recompute.ts';
import { DocumentSolverClient } from '../adapters/solver/document-solver-client.ts';
import { SketchDrag } from './sketch-drag.ts';
export interface ProjectSnapshot {
  document:ProjectDocument;revision:number;projectSessionId:string;dirty:boolean;canUndo:boolean;canRedo:boolean;busy:boolean;
  diagnostics:DiagnosticCache;
}
export class ProjectSession {
  private solver=new DocumentSolverClient();
  private previewSolver=new DocumentSolverClient();
  private drag:SketchDrag|null=null;
  private engine=new ProjectEngine(createEmptyProject(),{recompute:sketchRecompute((input,revision)=>this.solver.solve(input,revision))});
  get derivedCache(){return this.engine.cache;}
  private listeners=new Set<(snapshot:ProjectSnapshot)=>void>();
  snapshot():ProjectSnapshot {return {document:this.engine.document,revision:this.engine.revision,projectSessionId:this.engine.projectSessionId,
    dirty:this.engine.dirty,canUndo:this.engine.canUndo,canRedo:this.engine.canRedo,busy:this.engine.busy,diagnostics:this.engine.diagnostics};}
  subscribe(listener:(snapshot:ProjectSnapshot)=>void):()=>void {this.listeners.add(listener);listener(this.snapshot());return ()=>this.listeners.delete(listener);}
  private publish():void {for(const listener of this.listeners)listener(this.snapshot());}
  async execute(command:ProjectCommand):Promise<void> {
    this.cancelDrag();
    const pending=this.engine.execute(command);this.publish();try{await pending;}finally{this.publish();}
  }
  undo():void {this.cancelDrag();this.engine.undo();this.publish();}
  redo():void {this.cancelDrag();this.engine.redo();this.publish();}
  beginDrag(sketchId:string,pointId:string,preview:(sketch:SketchFeature)=>void,error:(message:string)=>void):SketchDrag {
    this.cancelDrag();const snapshot=this.snapshot(),feature=snapshot.document.features.find(f=>f.id===sketchId);
    if(feature?.kind!=='sketch'||snapshot.busy)throw new DomainError('DRAG_UNAVAILABLE','当前草图不可拖动');
    const isCurrent=()=>this.engine.projectSessionId===snapshot.projectSessionId&&this.engine.revision===snapshot.revision&&!this.engine.busy;
    const gesture=new SketchDrag({sketch:feature,pointId,isCurrent,preview,error,
      solve:input=>this.previewSolver.solve(input,snapshot.revision),
      cancelSolve:()=>{this.previewSolver.dispose();this.previewSolver=new DocumentSolverClient();},
      commit:async sketch=>{if(!isCurrent())throw new DomainError('STALE_GESTURE','旧拖动已丢弃');this.drag=null;await this.execute({kind:'replace-feature',feature:sketch});},
    });this.drag=gesture;return gesture;
  }
  cancelDrag():void {this.drag?.cancel();this.drag=null;}
  cancelPending():void {
    this.cancelDrag();
    if(this.engine.cancelPending()){this.solver.dispose();this.solver=new DocumentSolverClient();this.publish();}
  }
  newProject():void {this.cancelDrag();this.engine.resetEmpty(createEmptyProject());this.solver.dispose();this.solver=new DocumentSolverClient();this.previewSolver.dispose();this.previewSolver=new DocumentSolverClient();this.publish();}
  dispose():void{this.cancelDrag();this.solver.dispose();this.previewSolver.dispose();this.listeners.clear();}
}
