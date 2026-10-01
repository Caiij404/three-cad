import type { SolverResult, SolverSketch } from '../../core/solver-types.ts';
import type { SolverReply, SolverRequest } from '../../workers/solver-protocol.ts';

export class SolverClient {
  private worker: Worker;
  private sessionId = crypto.randomUUID();
  private nextId = 0;
  private disposed = false;
  private pending = new Map<number, { revision: number; resolve: (value: SolverResult) => void;
    reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor() { this.worker = this.createWorker(); }

  private createWorker(): Worker {
    const worker = new Worker(new URL('../../workers/solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<SolverReply>) => {
      const request = this.pending.get(data.requestId);
      if (data.sessionId !== this.sessionId || !request || data.revision !== request.revision) return;
      clearTimeout(request.timer);
      this.pending.delete(data.requestId);
      if (data.ok) request.resolve(data.result);
      else request.reject(new Error(`${data.error.code}: ${data.error.message}`));
    };
    worker.onerror = event => this.reset(new Error(`WORKER_ERROR: ${event.message}`));
    worker.onmessageerror = () => this.reset(new Error('WORKER_MESSAGE_ERROR: reply cannot be decoded'));
    return worker;
  }

  private reset(error: Error): void {
    this.worker.terminate();
    this.sessionId = crypto.randomUUID();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer); request.reject(error);
    }
    this.pending.clear();
    if (!this.disposed) this.worker = this.createWorker();
  }

  solve(sketch: SolverSketch, revision = 0): Promise<SolverResult> {
    if (this.disposed) return Promise.reject(new Error('WORKER_DISPOSED: client has been closed'));
    const requestId = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.reset(new Error('SOLVER_TIMEOUT: worker exceeded 10 seconds')), 10_000);
      this.pending.set(requestId, { revision, resolve, reject, timer });
      const request: SolverRequest = { sessionId: this.sessionId, requestId, revision, sketch };
      try { this.worker.postMessage(request); }
      catch (cause) {
        clearTimeout(timer); this.pending.delete(requestId);
        reject(new Error(`WORKER_REQUEST_ERROR: ${cause instanceof Error ? cause.message : String(cause)}`));
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset(new Error('WORKER_DISPOSED: client has been closed'));
  }
}
