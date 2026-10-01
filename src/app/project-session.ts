import { ProjectEngine, type ProjectCommand } from '../core/commands/project-engine.ts';
import { createEmptyProject, type ProjectDocument } from '../core/model/document.ts';
import { sketchRecompute } from './sketch-recompute.ts';
import { DocumentSolverClient } from '../adapters/solver/document-solver-client.ts';
export interface ProjectSnapshot {
  document:ProjectDocument;revision:number;projectSessionId:string;dirty:boolean;canUndo:boolean;canRedo:boolean;busy:boolean;
}
export class ProjectSession {
  private solver=new DocumentSolverClient();
  private engine=new ProjectEngine(createEmptyProject(),{recompute:sketchRecompute((input,revision)=>this.solver.solve(input,revision))});
  get derivedCache(){return this.engine.cache;}
  private listeners=new Set<(snapshot:ProjectSnapshot)=>void>();
  snapshot():ProjectSnapshot {return {document:this.engine.document,revision:this.engine.revision,projectSessionId:this.engine.projectSessionId,
    dirty:this.engine.dirty,canUndo:this.engine.canUndo,canRedo:this.engine.canRedo,busy:this.engine.busy};}
  subscribe(listener:(snapshot:ProjectSnapshot)=>void):()=>void {this.listeners.add(listener);listener(this.snapshot());return ()=>this.listeners.delete(listener);}
  private publish():void {for(const listener of this.listeners)listener(this.snapshot());}
  async execute(command:ProjectCommand):Promise<void> {
    const pending=this.engine.execute(command);this.publish();try{await pending;}finally{this.publish();}
  }
  undo():void {this.engine.undo();this.publish();}
  redo():void {this.engine.redo();this.publish();}
  cancelPending():void {
    if(this.engine.cancelPending()){this.solver.dispose();this.solver=new DocumentSolverClient();this.publish();}
  }
  newProject():void {this.engine.resetEmpty(createEmptyProject());this.solver.dispose();this.solver=new DocumentSolverClient();this.publish();}
  dispose():void{this.solver.dispose();this.listeners.clear();}
}
