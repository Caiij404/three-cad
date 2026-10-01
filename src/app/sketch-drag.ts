import { DomainError, type SketchFeature, type Vec2 } from '../core/model/document.ts';
import { moveSketchPoint, requireDrawableSketch } from '../core/geometry/sketch-edit.ts';
import type { SketchSolution, SketchSolveInput } from '../core/sketch-solution.ts';

interface DragOptions {
  sketch:SketchFeature;pointId:string;
  solve:(input:SketchSolveInput)=>Promise<SketchSolution>;
  isCurrent:()=>boolean;
  preview:(sketch:SketchFeature)=>void;
  error:(message:string)=>void;
  commit:(sketch:SketchFeature)=>Promise<void>;
  cancelSolve:()=>void;
}
/** One native request in flight and one replaceable latest input; no authoritative writes during movement. */
export class SketchDrag {
  private base:SketchFeature;
  private active=true;
  private finishing=false;
  private running=false;
  private sequence=0;
  private pending:{sequence:number;position:Vec2}|null=null;
  private latest:{sequence:number;sketch:SketchFeature}|null=null;
  private failure:Error|null=null;
  private waiters:Array<()=>void>=[];
  private options:DragOptions;
  constructor(options:DragOptions){this.options=options;this.base=structuredClone(options.sketch);moveSketchPoint(this.base,options.pointId,this.base.points.find(p=>p.id===options.pointId)?.position??[0,0]);}
  update(position:Vec2):void {
    if(!this.active||this.finishing)return;
    this.pending={sequence:++this.sequence,position:[...position]};this.latest=null;this.failure=null;
    if(!this.running)void this.pump();
  }
  private async pump():Promise<void> {
    this.running=true;
    try{
      while(this.active&&this.pending){
        const input=this.pending;this.pending=null;
        try{
          const sketch=moveSketchPoint(this.base,this.options.pointId,input.position);
          const result=await this.options.solve({sketch,draggedPointId:this.options.pointId});
          if(!this.active||!this.options.isCurrent()||input.sequence!==this.sequence)continue;
          if(!result.sketch)throw new DomainError('SOLVER_REJECTED',`拖动求解失败：${result.status}`);
          requireDrawableSketch(result.sketch);this.latest={sequence:input.sequence,sketch:result.sketch};this.options.preview(structuredClone(result.sketch));
        }catch(cause){
          if(this.active&&this.options.isCurrent()&&input.sequence===this.sequence){this.failure=cause instanceof Error?cause:new Error(String(cause));this.options.error(this.failure.message);}
        }
      }
    }finally{this.running=false;this.waiters.splice(0).forEach(resolve=>resolve());}
  }
  async finish():Promise<void> {
    if(!this.active||this.finishing)return;this.finishing=true;
    if(this.running)await new Promise<void>(resolve=>this.waiters.push(resolve));
    if(!this.active)return;
    if(!this.options.isCurrent()){this.cancel();throw new DomainError('STALE_GESTURE','草图或项目已改变，旧拖动已丢弃');}
    if(this.failure){const failure=this.failure;this.cancel();throw failure;}
    const solved=this.latest;this.active=false;
    if(!solved||solved.sequence!==this.sequence)return;
    // Fully constrained dragging can return round-off only; do not create a spurious history entry.
    const unchanged=solved.sketch.points.every((p,i)=>Math.hypot(p.position[0]-this.base.points[i]!.position[0],p.position[1]-this.base.points[i]!.position[1])<=1e-8)
      &&solved.sketch.entities.every((e,i)=>e.kind!=='circle'||Math.abs(e.radius-(this.base.entities[i] as Extract<typeof e,{kind:'circle'}>).radius)<=1e-8);
    if(unchanged)return;
    await this.options.commit(structuredClone(solved.sketch));
  }
  cancel():void {if(!this.active)return;this.active=false;this.sequence++;this.pending=null;this.latest=null;this.options.cancelSolve();this.waiters.splice(0).forEach(resolve=>resolve());}
}
