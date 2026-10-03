import { ProjectEngine, type DiagnosticCache, type ProjectCommand, type SaveSnapshot } from '../core/commands/project-engine.ts';
import { createEmptyProject, DomainError, type ExtrudeFeature, type ProjectDocument, type SketchFeature } from '../core/model/document.ts';
import { featureRecompute } from './feature-recompute.ts';
import { ExtrusionPreview, type ExtrusionPreviewValue } from './extrusion-preview.ts';
import { SolidClient } from '../adapters/solid/solid-client.ts';
import { DocumentSolverClient } from '../adapters/solver/document-solver-client.ts';
import { SketchDrag } from './sketch-drag.ts';
import { parseProjectJson } from '../core/model/validate-document.ts';
export interface ProjectSnapshot {
  document:ProjectDocument;revision:number;projectSessionId:string;dirty:boolean;canUndo:boolean;canRedo:boolean;busy:boolean;
  diagnostics:DiagnosticCache;
}
export class ProjectSession {
  private solver=new DocumentSolverClient();
  private previewSolver=new DocumentSolverClient();
  private solid=new SolidClient();
  private previewSolid=new SolidClient();
  private extrusion:ExtrusionPreview|null=null;
  private drag:SketchDrag|null=null;
  private engine=new ProjectEngine(createEmptyProject(),{recompute:featureRecompute((input,revision)=>this.solver.solve(input,revision),(input,revision)=>this.solid.run(input,revision))});
  get derivedCache(){return this.engine.cache;}
  get readonlyDerivedCache(){return this.engine.readonlyCache;}
  private listeners=new Set<(snapshot:ProjectSnapshot)=>void>();
  snapshot():ProjectSnapshot {return {document:this.engine.document,revision:this.engine.revision,projectSessionId:this.engine.projectSessionId,
    dirty:this.engine.dirty,canUndo:this.engine.canUndo,canRedo:this.engine.canRedo,busy:this.engine.busy,diagnostics:this.engine.diagnostics};}
  subscribe(listener:(snapshot:ProjectSnapshot)=>void):()=>void {this.listeners.add(listener);listener(this.snapshot());return ()=>this.listeners.delete(listener);}
  private publish():void {for(const listener of this.listeners)listener(this.snapshot());}
  async execute(command:ProjectCommand):Promise<void> {
    this.cancelDrag();this.cancelExtrusion();
    const pending=this.engine.execute(command);this.publish();try{await pending;}finally{this.publish();}
  }
  undo():void {this.cancelDrag();this.cancelExtrusion();this.engine.undo();this.publish();}
  redo():void {this.cancelDrag();this.cancelExtrusion();this.engine.redo();this.publish();}
  beginExtrusion(sketchId:string,region:ExtrudeFeature['region'],preview:(value:ExtrusionPreviewValue|null)=>void,error:(message:string)=>void):ExtrusionPreview {
    this.cancelDrag();this.cancelExtrusion();const snapshot=this.snapshot(),sketch=snapshot.document.features.find(f=>f.id===sketchId);
    if(sketch?.kind!=='sketch'||snapshot.busy)throw new DomainError('EXTRUSION_UNAVAILABLE','当前草图不可拉伸');
    const isCurrent=()=>this.engine.projectSessionId===snapshot.projectSessionId&&this.engine.revision===snapshot.revision&&!this.engine.busy;
    const feature:ExtrudeFeature={id:crypto.randomUUID(),kind:'extrude',name:`拉伸 ${snapshot.document.features.filter(f=>f.kind==='extrude').length+1}`,visible:true,sketchId,
      region:structuredClone(region),depth:10};
    const previewClient=this.previewSolid;
    const gesture=new ExtrusionPreview({sketch,feature,isCurrent,preview,error,
      run:input=>previewClient.run(input,snapshot.revision),
      cancelRun:()=>{previewClient.dispose();if(this.previewSolid===previewClient)this.previewSolid=new SolidClient();},
      commit:async feature=>{
        if(!isCurrent())throw new DomainError('STALE_PREVIEW','旧预览已丢弃');this.extrusion=null;
        // A new preview must never share a client still owned by this commit's finally block.
        previewClient.dispose();if(this.previewSolid===previewClient)this.previewSolid=new SolidClient();
        await this.execute({kind:'add-feature',feature});
      },
    });this.extrusion=gesture;return gesture;
  }
  cancelExtrusion():void {this.extrusion?.cancel();this.extrusion=null;}
  beginDrag(sketchId:string,pointId:string,preview:(sketch:SketchFeature)=>void,error:(message:string)=>void):SketchDrag {
    this.cancelDrag();this.cancelExtrusion();const snapshot=this.snapshot(),feature=snapshot.document.features.find(f=>f.id===sketchId);
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
    this.cancelDrag();this.cancelExtrusion();
    if(this.engine.cancelPending()){this.solver.dispose();this.solver=new DocumentSolverClient();this.solid.dispose();this.solid=new SolidClient();this.publish();}
  }
  captureSave():SaveSnapshot{return this.engine.captureSave();}
  setView(view:ProjectDocument['view']):void {if(this.engine.setView(view))this.publish();}
  markSaved(snapshot:SaveSnapshot):boolean {const accepted=this.engine.markSaved(snapshot);if(accepted)this.publish();return accepted;}
  async openJson(text:string,options:{recovered?:boolean}={}):Promise<void> {
    const document=parseProjectJson(text);this.cancelDrag();this.cancelExtrusion();
    const pending=this.engine.openDocument(document,{markAsSaved:!options.recovered});this.publish();try{await pending;}finally{this.publish();}
  }
  newProject():void {this.cancelDrag();this.cancelExtrusion();this.engine.resetEmpty(createEmptyProject());this.solver.dispose();this.solver=new DocumentSolverClient();this.previewSolver.dispose();this.previewSolver=new DocumentSolverClient();this.solid.dispose();this.solid=new SolidClient();this.previewSolid.dispose();this.previewSolid=new SolidClient();this.publish();}
  dispose():void{this.cancelDrag();this.cancelExtrusion();this.solver.dispose();this.previewSolver.dispose();this.solid.dispose();this.previewSolid.dispose();this.listeners.clear();}
}
