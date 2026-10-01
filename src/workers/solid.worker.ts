import { runSolid } from '../adapters/solid/solid-spike.ts';
import type { SolidInput, TriangleMesh } from '../core/mesh-types.ts';

interface Request { requestId:number; sessionId:string; revision:number; input:SolidInput }
const scope=globalThis as unknown as { onmessage:(event:MessageEvent<Request>)=>void;postMessage(value:unknown):void };
scope.onmessage=({data})=>{
  const meta={requestId:data.requestId,sessionId:data.sessionId,revision:data.revision};
  try {
    const mesh:TriangleMesh=runSolid(data.input);
    scope.postMessage({...meta,ok:true,output:mesh});
  } catch(cause) { scope.postMessage({...meta,ok:false,error:cause instanceof Error ? cause.message : String(cause)}); }
};
