import type { SketchSolution, SketchSolveInput } from '../../core/sketch-solution.ts';
import { WorkerRpc } from '../../workers/worker-rpc.ts';
export class DocumentSolverClient {
  private rpc=new WorkerRpc<SketchSolveInput,SketchSolution>({
    createWorker:()=>new Worker(new URL('../../workers/document-solver.worker.ts',import.meta.url),{type:'module'}),
  });
  solve(input:SketchSolveInput,revision=0):Promise<SketchSolution>{return this.rpc.request(input,revision);}
  dispose():void{this.rpc.dispose();}
}
