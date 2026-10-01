import { solveSketch } from '../adapters/solver/solve-sketch.ts';
import type { SlvsFactory, SlvsModule } from '../adapters/solver/slvs-types.ts';
import type { SolverReply, SolverRequest } from './solver-protocol.ts';

const scope = globalThis as unknown as {
  location: { origin: string }; onmessage: (event: MessageEvent<SolverRequest>) => void;
  postMessage(reply: SolverReply): void;
};
let loading: Promise<SlvsModule> | undefined;
async function getModule(): Promise<SlvsModule> {
  if (!loading) {
    loading = (async () => {
      if (typeof WebAssembly === 'undefined') throw new Error('WASM_UNAVAILABLE: WebAssembly is unavailable');
      const url = new URL(`${import.meta.env.BASE_URL}wasm/slvs.mjs`, scope.location.origin).href;
      const { default: createModule } = await import(/* @vite-ignore */ url) as { default: SlvsFactory };
      return createModule({ locateFile: file => new URL(file, url).href });
    })();
  }
  return loading;
}
scope.onmessage = async ({ data }) => {
  const meta = { sessionId: data.sessionId, requestId: data.requestId, revision: data.revision };
  try {
    const module = await getModule();
    // Synchronous native solve runs to completion before the next message can enter it.
    scope.postMessage({ ...meta, ok: true, result: solveSketch(module, data.sketch) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    scope.postMessage({ ...meta, ok: false, error: { code: message.split(':')[0] || 'SOLVER_ERROR', message } });
    // The next explicit retry can instantiate a fresh module after load/native failure.
    loading = undefined;
  }
};
