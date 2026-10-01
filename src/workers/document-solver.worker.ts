import { solveDomainSketch } from '../adapters/solver/solve-domain-sketch.ts';
import type { SlvsFactory, SlvsModule } from '../adapters/solver/slvs-types.ts';
import type { SketchSolveInput, SketchSolution } from '../core/sketch-solution.ts';
interface Meta {sessionId:string;requestId:number;revision:number}
type Request=Meta & {input:SketchSolveInput};
type Reply=Meta & ({ok:true;output:SketchSolution}|{ok:false;error:string});
const scope=globalThis as unknown as {location:{origin:string};onmessage:(event:MessageEvent<Request>)=>void;postMessage:(reply:Reply)=>void};
let loading:Promise<SlvsModule>|undefined;
async function getModule():Promise<SlvsModule>{
  if(!loading)loading=(async()=>{
    if(typeof WebAssembly==='undefined')throw new Error('WASM_UNAVAILABLE: 浏览器没有 WebAssembly');
    const url=new URL(`${import.meta.env.BASE_URL}wasm/slvs.mjs`,scope.location.origin).href;
    const {default:createModule}=await import(/* @vite-ignore */ url) as {default:SlvsFactory};
    return createModule({locateFile:file=>new URL(file,url).href});
  })();return loading;
}
scope.onmessage=async({data})=>{
  const meta={sessionId:data.sessionId,requestId:data.requestId,revision:data.revision};
  try{scope.postMessage({...meta,ok:true,output:solveDomainSketch(await getModule(),data.input)});}
  catch(cause){scope.postMessage({...meta,ok:false,error:cause instanceof Error?cause.message:String(cause)});loading=undefined;}
};
