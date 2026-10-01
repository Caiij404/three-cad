import { ProjectEngine, type ProjectCommand } from '../core/commands/project-engine.ts';
import { createEmptyProject, type ProjectDocument } from '../core/model/document.ts';
export interface ProjectSnapshot {
  document:ProjectDocument;revision:number;projectSessionId:string;dirty:boolean;canUndo:boolean;canRedo:boolean;busy:boolean;
}
export class ProjectSession {
  private engine=new ProjectEngine();
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
  newProject():void {this.engine.resetEmpty(createEmptyProject());this.publish();}
}
