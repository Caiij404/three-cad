import type { SolidInput, TriangleMesh } from '../../core/mesh-types.ts';
import { WorkerRpc } from '../../workers/worker-rpc.ts';
export class SolidClient {
  private rpc = new WorkerRpc<SolidInput, TriangleMesh>({
    createWorker: () => new Worker(new URL('../../workers/solid.worker.ts', import.meta.url), { type: 'module' }),
  });
  run(input: SolidInput, revision = 0): Promise<TriangleMesh> { return this.rpc.request(input, revision); }
  dispose(): void { this.rpc.dispose(); }
}
