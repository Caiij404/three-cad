import type { SolidInput, TriangleMesh } from '../../core/mesh-types.ts';
import { WorkerRpc } from '../../workers/worker-rpc.ts';
import { encodeSolidInput, decodeSolidMesh, solidInputTransfer, type SolidWireInput, type SolidWireMesh } from './solid-wire.ts';
export class SolidClient {
  private rpc = new WorkerRpc<SolidWireInput, SolidWireMesh>({
    createWorker: () => new Worker(new URL('../../workers/solid.worker.ts', import.meta.url), { type: 'module' }),
    inputTransfer:solidInputTransfer,
  });
  async run(input: SolidInput, revision = 0): Promise<TriangleMesh> {return decodeSolidMesh(await this.rpc.request(encodeSolidInput(input),revision));}
  dispose(): void { this.rpc.dispose(); }
}
