import type { SolidInput, TriangleMesh } from '../../core/mesh-types.ts';

export class SolidClient {
  private worker:Worker|undefined;
  private sessionId=crypto.randomUUID();
  private nextId=0;
  private disposed=false;
  private pending=new Map<number,{revision:number;resolve:(mesh:TriangleMesh)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private getWorker():Worker {
    if(this.worker)return this.worker;
    const worker=new Worker(new URL('../../workers/solid.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      const item=this.pending.get(data.requestId);
      if(!item || data.sessionId!==this.sessionId || data.revision!==item.revision)return;
      clearTimeout(item.timer);this.pending.delete(data.requestId);
      data.ok ? item.resolve(data.mesh) : item.reject(new Error(data.error));
    };
    worker.onerror=event=>this.reset(new Error(`SOLID_WORKER_ERROR: ${event.message}`));
    worker.onmessageerror=()=>this.reset(new Error('SOLID_WORKER_MESSAGE_ERROR'));
    this.worker=worker; return worker;
  }
  private reset(error:Error):void {
    this.worker?.terminate();this.worker=undefined;this.sessionId=crypto.randomUUID();
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);} this.pending.clear();
  }
  run(input:SolidInput,revision=0):Promise<TriangleMesh> {
    if(this.disposed)return Promise.reject(new Error('SOLID_WORKER_DISPOSED'));
    return new Promise((resolve,reject)=>{
      const requestId=++this.nextId;
      try {
        const worker=this.getWorker();
        const timer=setTimeout(()=>this.reset(new Error('SOLID_TIMEOUT: exceeded 10 seconds')),10000);
        this.pending.set(requestId,{revision,resolve,reject,timer});
        worker.postMessage({requestId,sessionId:this.sessionId,revision,input});
      }catch(cause){this.reset(cause instanceof Error?cause:new Error(String(cause)));reject(cause);}
    });
  }
  dispose():void { if(this.disposed)return;this.disposed=true;this.reset(new Error('SOLID_WORKER_DISPOSED')); }
}
