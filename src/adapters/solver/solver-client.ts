import type { SolverResult, SolverSketch } from '../../core/solver-types.ts';
import { WorkerRpc } from '../../workers/worker-rpc.ts';
export class SolverClient {
  private rpc = new WorkerRpc<SolverSketch, SolverResult>({
    createWorker: () => new Worker(new URL('../../workers/solver.worker.ts', import.meta.url), { type: 'module' }),
  });
  solve(sketch: SolverSketch, revision = 0): Promise<SolverResult> { return this.rpc.request(sketch, revision); }
  dispose(): void { this.rpc.dispose(); }
}
