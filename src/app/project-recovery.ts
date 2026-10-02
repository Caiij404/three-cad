import { DomainError } from '../core/model/document.ts';
import { parseProjectJson, serializeProject } from '../core/model/validate-document.ts';
import type { ProjectSnapshot } from './project-session.ts';
import type { RecoveryRecord, RecoveryStore } from '../adapters/files/recovery-store.ts';
interface RecoverySession {
  snapshot():ProjectSnapshot;subscribe(listener:(snapshot:ProjectSnapshot)=>void):()=>void;
  openJson(text:string,options?:{recovered?:boolean}):Promise<void>;cancelPending():void;
}
export interface RecoveryState {
  phase:'checking'|'idle'|'waiting'|'writing'|'saved'|'offered'|'restoring'|'discarding'|'error';
  candidate:{name:string;savedAt:string}|null;message:string;error:string;
}
export class ProjectRecovery {
  private state:RecoveryState={phase:'checking',candidate:null,message:'正在检查自动恢复副本…',error:''};
  private listeners=new Set<(state:RecoveryState)=>void>();
  private record:RecoveryRecord|null=null;
  private initialized=false;private disposed=false;private restoring=false;
  private generation=0;private restoreEpoch=0;private observed:string;private observedSession:string;
  private timer:ReturnType<typeof setTimeout>|undefined;private queue:Promise<void>=Promise.resolve();private unsubscribe:()=>void;
  private session:RecoverySession;private store:RecoveryStore;private delay:number;
  constructor(session:RecoverySession,store:RecoveryStore,delay=1000) {
    this.session=session;this.store=store;this.delay=delay;
    const snapshot=session.snapshot();this.observed=this.stamp(snapshot);this.observedSession=snapshot.projectSessionId;
    this.unsubscribe=session.subscribe(snapshot=>this.changed(snapshot));void this.check();
  }
  snapshot():RecoveryState{return structuredClone(this.state);}
  subscribe(listener:(state:RecoveryState)=>void):()=>void {this.listeners.add(listener);listener(this.snapshot());return()=>this.listeners.delete(listener);}
  private publish(phase:RecoveryState['phase'],message:string,error=''):void {
    if(this.disposed)return;this.state={...this.state,phase,message,error};for(const listener of this.listeners)listener(this.snapshot());
  }
  private stamp(snapshot:ProjectSnapshot):string {return `${snapshot.projectSessionId}:${snapshot.revision}:${JSON.stringify(snapshot.document)}`;}
  private failure(cause:unknown):void {const e=cause as Error&{code?:string};this.publish('error','',`${e.code??'RECOVERY_FAILED'}：${e.message??String(cause)}`);}
  private async check():Promise<void> {
    const generation=this.generation;this.publish('checking','正在检查自动恢复副本…');
    try{
      const value=await this.store.read();if(this.disposed)return;this.initialized=true;
      // An asynchronous read cannot offer an older project over a user edit/open/new.
      if(generation!==this.generation||this.generation>0){this.schedule();return;}
      if(value===undefined||value===null){this.publish('idle','尚无自动恢复副本。');return;}
      const record=value as Partial<RecoveryRecord>;
      if(record.recoveryVersion!==1||typeof record.text!=='string'||typeof record.savedAt!=='string'||!Number.isFinite(Date.parse(record.savedAt)))throw new DomainError('RECOVERY_INVALID','自动恢复记录损坏，请放弃此副本');
      const document=parseProjectJson(record.text);this.record=record as RecoveryRecord;this.state.candidate={name:document.name,savedAt:record.savedAt};
      this.publish('offered','找到自动恢复副本，请选择恢复或放弃。');
    }catch(cause){this.failure(cause);}
  }
  private changed(snapshot:ProjectSnapshot):void {
    const stamp=this.stamp(snapshot);if(stamp===this.observed)return;
    const switched=snapshot.projectSessionId!==this.observedSession;this.observed=stamp;this.observedSession=snapshot.projectSessionId;this.generation++;
    if(this.restoring)return;
    if(switched){this.record=null;this.state.candidate=null;}
    if(this.initialized&&!this.record)this.schedule();
  }
  private schedule():void {
    if(this.disposed||this.record||this.restoring)return;clearTimeout(this.timer);
    this.publish('waiting','自动恢复等待1秒写入；未代替手动保存。');
    const generation=this.generation;
    this.timer=setTimeout(()=>{this.timer=undefined;
      this.queue=this.queue.then(async()=>{
        if(this.disposed||generation!==this.generation||this.record||this.restoring)return;
        try{
          const record:RecoveryRecord={recoveryVersion:1,savedAt:new Date().toISOString(),text:serializeProject(this.session.snapshot().document)};
          this.publish('writing','正在写入自动恢复副本…');await this.store.write(record);
          if(!this.disposed&&generation===this.generation)this.publish('saved','自动恢复副本已更新；未代替手动保存。');
        }catch(cause){if(!this.disposed&&generation===this.generation)this.failure(cause);}
      });
    },this.delay);
  }
  async restore():Promise<void> {
    if(!this.record||this.restoring||this.session.snapshot().busy)return;
    clearTimeout(this.timer);this.generation++;const epoch=++this.restoreEpoch;this.restoring=true;this.publish('restoring','正在重建自动恢复项目…');
    try{
      await this.session.openJson(this.record.text,{recovered:true});if(this.disposed||!this.restoring||epoch!==this.restoreEpoch)return;
      this.record=null;this.state.candidate=null;this.restoring=false;this.schedule();
    }catch(cause){if(!this.disposed&&this.restoring&&epoch===this.restoreEpoch){this.restoring=false;this.failure(cause);}}
  }
  cancelRestore():void {
    if(!this.restoring)return;this.restoring=false;this.restoreEpoch++;this.generation++;this.session.cancelPending();this.publish('offered','已取消恢复，当前项目保留。');
  }
  async discard():Promise<void> {
    if(this.restoring)return;clearTimeout(this.timer);this.generation++;this.record=null;this.state.candidate=null;this.publish('discarding','正在放弃自动恢复副本…');
    const generation=this.generation;
    this.queue=this.queue.then(async()=>{if(this.disposed)return;try{await this.store.clear();this.initialized=true;if(generation===this.generation)this.publish('idle','已放弃自动恢复副本，当前项目保留。');}catch(cause){this.failure(cause);}});
    await this.queue;
  }
  retry():void {if(!this.initialized)void this.check();else if(this.record)this.publish('offered','可重试恢复或放弃此副本。');else this.schedule();}
  dispose():void {this.disposed=true;this.generation++;clearTimeout(this.timer);this.unsubscribe();this.listeners.clear();}
}
