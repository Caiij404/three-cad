import { SolverClient } from '../adapters/solver/solver-client.ts';
import { SolidClient } from '../adapters/solid/solid-client.ts';
import { WorkerRpc } from '../workers/worker-rpc.ts';
import { rectangle, runSolverFixtures } from './solver-fixtures.ts';
import { checkSolid, runSolidFixtures, solidFixtures } from './solid-fixtures.ts';
import type { SolverResult, SolverSketch } from '../core/solver-types.ts';

function require(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`GATE: ${message}`);
}
function timingSummary(samples: number[]) {
  const sorted=[...samples].sort((a,b)=>a-b);
  return {samplesMs:samples,medianMs:sorted[Math.floor(sorted.length/2)]!,p95Ms:sorted[Math.ceil(sorted.length*0.95)-1]!};
}
export async function runGate() {
  const solver=new SolverClient(),solid=new SolidClient();
  const longTasks:number[]=[];
  const observer=typeof PerformanceObserver!=='undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration))) : undefined;
  observer?.observe({type:'longtask'});
  const startedAt=performance.now();
  try {
    const [solverCases,solidCases]=await Promise.all([
      runSolverFixtures(input=>solver.solve(input)),runSolidFixtures(input=>solid.run(input)),
    ]);
    // Distinct kernels have separate worker state. Invalid input must not poison next valid call.
    let rejected=false;
    try{await solid.run({kind:'hole-extrusion',plane:'XY',depth:0});}catch{rejected=true;}
    require(rejected,'invalid solid input was accepted');
    checkSolid(solidFixtures[0]!,await solid.run(solidFixtures[0]!.input));
    const solverSamples:number[]=[],solidSamples:number[]=[];
    for(let i=0;i<30;i++) {
      const width=i%2?60:40;
      await Promise.all([
        (async()=>{const at=performance.now(),result=await solver.solve(rectangle(width),i);solverSamples.push(performance.now()-at);
          require(result.status==='fully-constrained' && result.dof===0 && result.points!==null,'benchmark solver status');
          const p0=result.points.find(p=>p.id==='p0')!,p1=result.points.find(p=>p.id==='p1')!;
          require(Math.abs(Math.hypot(p1.x-p0.x,p1.y-p0.y)-width)<=1e-5,'benchmark rectangle residual');})(),
        (async()=>{const at=performance.now(),mesh=await solid.run(solidFixtures[0]!.input,i);solidSamples.push(performance.now()-at);
          checkSolid(solidFixtures[0]!,mesh);})(),
      ]);
    }
    // Use default 10000 ms timeout with a real deliberately silent browser Worker.
    let created=0;
    const timeoutClient=new WorkerRpc<SolverSketch,SolverResult>({createWorker:()=>{
      created++;
      return created===1 ? new Worker(new URL('./stall.worker.ts',import.meta.url),{type:'module'})
        : new Worker(new URL('../workers/solver.worker.ts',import.meta.url),{type:'module'});
    }});
    let deadlineMs=0;
    try {
      const at=performance.now();let message='';
      try{await timeoutClient.request(rectangle());}catch(cause){message=cause instanceof Error?cause.message:String(cause);}
      deadlineMs=performance.now()-at;
      require(message.includes('WORKER_TIMEOUT') && deadlineMs>=9900,'real 10 second timeout failed');
      const recovered=await timeoutClient.request(rectangle(60));
      require(recovered.status==='fully-constrained' && recovered.dof===0 && recovered.points!==null,'timeout recovery solver');
      require(Math.abs(recovered.points.find(p=>p.id==='p1')!.x-60)<=1e-5,'timeout recovery geometry');
    }finally{timeoutClient.dispose();}
    // Let PerformanceObserver deliver pending entries; records are diagnostic for this small fixture only.
    await new Promise(resolve=>setTimeout(resolve,0));
    return {solverCases:solverCases.length,solidCases:solidCases.length,concurrent:true,invalidInputRecovered:true,
      timings:{method:'Warm 30 samples per kernel, concurrent browser Worker round trip; tiny M0 fixtures, not NFR-003 benchmark.',
        solver:timingSummary(solverSamples),solid:timingSummary(solidSamples)},
      timeout:{deadlineMs,expectedMs:10000,workerCreations:created,recovered:true},
      longTasks:{supported:Boolean(observer),durationsMs:longTasks,maxMs:Math.max(0,...longTasks)},
      totalMs:performance.now()-startedAt,passed:true};
  }finally{observer?.disconnect();solver.dispose();solid.dispose();}
}
