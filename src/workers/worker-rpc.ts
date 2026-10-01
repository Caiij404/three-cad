export interface WorkerPort {
  postMessage(value: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}
export interface WorkerRpcOptions {
  createWorker: () => WorkerPort;
  timeoutMs?: number;
  createSession?: () => string;
}
interface Pending<T> {
  revision: number;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
// Transport correlation only; document authority and atomic commits belong to app services.
export class WorkerRpc<Input, Output> {
  private worker: WorkerPort | undefined;
  private sessionId: string;
  private nextId = 0;
  private disposed = false;
  private pending = new Map<number, Pending<Output>>();
  private timeoutMs: number;
  private createSession: () => string;
  private options: WorkerRpcOptions;
  constructor(options: WorkerRpcOptions) {
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? 10000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('INVALID_TIMEOUT');
    this.createSession = options.createSession ?? (() => crypto.randomUUID());
    this.sessionId = this.createSession();
  }
  private getWorker(): WorkerPort {
    if (this.worker) return this.worker;
    const worker = this.options.createWorker();
    worker.onmessage = ({ data }) => {
      if (this.worker !== worker || !data || data.sessionId !== this.sessionId) return;
      const item = this.pending.get(data.requestId);
      if (!item || item.revision !== data.revision || typeof data.ok !== 'boolean') return;
      clearTimeout(item.timer);
      this.pending.delete(data.requestId);
      if (data.ok) item.resolve(data.output);
      else item.reject(new Error(typeof data.error === 'string' ? data.error : 'WORKER_REPLY_ERROR'));
    };
    worker.onerror = event => {
      if (this.worker === worker) this.reset(new Error(`WORKER_ERROR: ${event.message}`));
    };
    worker.onmessageerror = () => {
      if (this.worker === worker) this.reset(new Error('WORKER_MESSAGE_ERROR'));
    };
    this.worker = worker;
    return worker;
  }
  private reset(error: Error): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.sessionId = this.createSession();
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
    // Retry creates a new Worker lazily, avoiding repeated crash/restart loops.
  }
  request(input: Input, revision = 0): Promise<Output> {
    if (this.disposed) return Promise.reject(new Error('WORKER_DISPOSED'));
    if (!Number.isSafeInteger(revision) || revision < 0) return Promise.reject(new Error('INVALID_REVISION'));
    return new Promise((resolve, reject) => {
      const requestId = ++this.nextId;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const worker = this.getWorker();
        timer = setTimeout(() => this.reset(new Error('WORKER_TIMEOUT: exceeded request deadline')), this.timeoutMs);
        this.pending.set(requestId, { revision, resolve, reject, timer });
        worker.postMessage({ requestId, sessionId: this.sessionId, revision, input });
      } catch (cause) {
        if (timer) clearTimeout(timer);
        this.pending.delete(requestId);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset(new Error('WORKER_DISPOSED'));
  }
}
