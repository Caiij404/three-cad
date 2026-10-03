import { runSolid } from '../adapters/solid/solid-spike.ts';
import { decodeSolidInput, encodeSolidMesh, type SolidWireInput } from '../adapters/solid/solid-wire.ts';
import { DomainError } from '../core/model/document.ts';

interface Request { requestId:number; sessionId:string; revision:number; input:SolidWireInput }
const scope=globalThis as unknown as { onmessage:(event:MessageEvent<Request>)=>void;postMessage(value:unknown,transfer?:Transferable[]):void };
scope.onmessage=({data})=>{
  const meta={requestId:data.requestId,sessionId:data.sessionId,revision:data.revision};
  try {
    const output=encodeSolidMesh(runSolid(decodeSolidInput(data.input)));
    scope.postMessage({...meta,ok:true,output},[output.positions.buffer]);
  } catch(cause) { scope.postMessage({...meta,ok:false,error:cause instanceof Error ? cause.message : String(cause),
    ...(cause instanceof DomainError ? {code:cause.code} : {})}); }
};
