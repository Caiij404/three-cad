import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { launchBrowserUi, pause } from './browser-ui-port.mjs';
import { change, documentData, feature, open, ready } from './e2e-ui-steps.mjs';
import { performanceFixture } from '../src/experiments/performance-fixtures.ts';
import { serializeProject } from '../src/core/model/validate-document.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),results=[];
const percentile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.ceil(values.length*p)-1];
async function install(ui) {
  await ui.evaluate(()=>{
    const s=window.__perf={requests:[],errors:[],phases:[],current:null,liveWorkers:0,frames:[],frame:0};
    window.addEventListener('error',e=>s.errors.push(e.message));window.addEventListener('unhandledrejection',e=>s.errors.push(String(e.reason)));
    const NativeWorker=Worker;
    window.Worker=class extends NativeWorker {
      constructor(...args){super(...args);s.liveWorkers++;this.alive=true;this.pending=new Map();this.addEventListener('message',e=>{const d=e.data,r=this.pending.get(d.requestId);if(!r)return;this.pending.delete(d.requestId);s.requests.push({...r,elapsedMs:performance.now()-r.start,ok:d.ok,triangles:d.output?.positions?.length/9,dof:d.output?.dof});},true);}
      postMessage(d,...args){this.pending.set(d.requestId,{start:performance.now(),kind:d.input?.kind??'solve',id:d.input?.sketch?.id,depth:d.input?.depth,phase:s.current?.name});super.postMessage(d,...args);}
      terminate(){if(this.alive){s.liveWorkers--;this.alive=false;}super.terminate();}
    };
    // Count actual WebGL draws per animation frame, rather than treating idle rAF callbacks as rendered frames.
    for(const name of ['drawArrays','drawElements']) {
      const original=WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name]=function(mode,...args){if(mode===this.TRIANGLES){let f=s.frames.at(-1);if(f?.frame!==s.frame){f={frame:s.frame,time:performance.now(),triangles:0,phase:s.current?.name};s.frames.push(f);}f.triangles+=(name==='drawArrays'?args[1]:args[0])/3;}return original.call(this,mode,...args);};
    }
    const tick=()=>{s.frame++;requestAnimationFrame(tick);};requestAnimationFrame(tick);
    let previous=performance.now();setInterval(()=>{const now=performance.now();if(s.current)s.current.gapsMs.push(now-previous);previous=now;},10);
    if(PerformanceObserver.supportedEntryTypes?.includes('longtask'))new PerformanceObserver(list=>{for(const entry of list.getEntries())if(s.current)s.current.longTasksMs.push(entry.duration);}).observe({type:'longtask'});
    s.begin=name=>{s.current={name,start:performance.now(),gapsMs:[],longTasksMs:[]};};
    s.end=()=>{const p=s.current;p.elapsedMs=performance.now()-p.start;s.phases.push(p);s.current=null;return p;};
  });
}
const begin=(ui,name)=>ui.evaluate(name=>window.__perf.begin(name),name);
async function end(ui){await pause(60);return ui.evaluate(()=>window.__perf.end());}
async function run(ui) {
  const path=resolve(ui.directory,'performance.tcad.json');writeFileSync(path,serializeProject(performanceFixture().document));
  await begin(ui,'cold-file-rebuild');await open(ui,path);const cold=await end(ui);
  const doc=await documentData(ui),lines=doc.features.find(f=>f.id==='performance-lines');
  assert.equal(lines.entities.length,100);assert.equal(lines.constraints.length,100);assert.equal(doc.features.reduce((n,f)=>n+(f.constraints?.length??0),0),100);assert.equal(doc.features.filter(f=>f.kind==='extrude').length,10);
  const generated=await ui.evaluate(()=>window.__perf.requests.filter(r=>r.kind==='sketch-extrusion'));
  assert.equal(generated.length,10);const triangles=generated.reduce((n,r)=>n+r.triangles,0);assert(triangles>=100000);
  await feature(ui,lines.id);await ui.click('编辑草图');
  const samples=Number(process.env.PERF_SCENE_SAMPLES??30),row='[data-constraint-id="length-0"]';
  for(let i=0;i<=samples;i++) {
    await ui.fill('约束数值 (mm)',i%2?10:11,row);
    await begin(ui,i===0?'warmup':'line-edit');await change(ui,()=>ui.clickCss(`${row} button`,'应用数值'));await end(ui);
    if(i%5===0)console.log(`Actual full scene: line edit ${i}/${samples}`);
  }
  await ui.click('完成草图');await ui.click('适应视图');await pause(200);
  const rect=await ui.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
  await begin(ui,'orbit');
  await ui.drag({x:rect.x-80,y:rect.y},{x:rect.x+80,y:rect.y+40},100,'right');
  const orbit=await end(ui);
  const data=await ui.evaluate(()=>({requests:window.__perf.requests,phases:window.__perf.phases,frames:window.__perf.frames,errors:window.__perf.errors,liveWorkers:window.__perf.liveWorkers}));
  const edits=data.requests.filter(r=>r.phase==='line-edit'),warmPhases=data.phases.filter(p=>p.name==='line-edit'),frames=data.frames.filter(f=>f.phase==='orbit');
  assert.equal(edits.length,samples);assert(edits.every(r=>r.kind==='solve'&&r.id===lines.id&&r.dof===300&&r.ok));assert.equal(data.errors.length,0);
  const fps=frames.slice(1).map((f,i)=>1000/(f.time-frames[i].time)),solverP95Ms=percentile(edits.map(r=>r.elapsedMs),.95),maxMainThreadGapMs=Math.max(...warmPhases.flatMap(p=>p.gapsMs));
  const maxTaskMs=Math.max(0,...data.phases.flatMap(p=>p.longTasksMs)),coldMaxGapMs=Math.max(...cold.gapsMs);
  const budgets={solver:samples>=30&&solverP95Ms<=200,mainThread:Math.max(maxMainThreadGapMs,coldMaxGapMs,maxTaskMs)<=200,viewport:frames.length>=31&&percentile(fps,.5)>=30};
  if(process.env.PERF_ASSERT_BUDGETS==='1')assert(Object.values(budgets).every(Boolean),JSON.stringify(budgets));
  return{kind:ui.kind,version:ui.version,input:{lines:100,constraints:100,solids:10,actualTriangles:triangles},samples,warmupExcluded:1,solverP95Ms,maxMainThreadGapMs,maxObservedLongTaskMs:maxTaskMs,coldMaxGapMs,orbit:{...orbit,renderedFrameCount:frames.length,medianFps:percentile(fps,.5),minActualTrianglesPerFrame:Math.min(...frames.map(f=>f.triangles))},budgets,...data};
}
let server;
try {
  await build({root});server=await preview({root,preview:{host:'127.0.0.1',port:0}});
  for(const kind of (process.env.E2E_BROWSER_KINDS??'chrome,edge,firefox').split(',')) {
    const ui=await launchBrowserUi(kind);ui.kind=kind;
    try {await ui.navigate(`http://127.0.0.1:${server.httpServer.address().port}/`);await ready(ui);await ui.resize(1280,720);await install(ui);results.push(await run(ui));console.log(JSON.stringify({kind,solverP95Ms:results.at(-1).solverP95Ms,maxMainThreadGapMs:results.at(-1).maxMainThreadGapMs,orbitFps:results.at(-1).orbit.medianFps,budgets:results.at(-1).budgets}));}
    finally{await ui.close();}
  }
  writeFileSync(process.env.PERF_SCENE_PATH??'.research/T-403C2-scene-probe.json',JSON.stringify({task:'T-403C2 diagnostic',executedAt:new Date().toISOString(),command:'node scripts/check-scene-performance.mjs',environment:{node:process.version,platform:process.platform},results,limitations:['CSG and long resource acceptance not yet included.','Timer gaps include the 10ms sampling interval; gaps are retained without claiming this is exact task duration.']},null,2)+'\n');
}finally{if(server){server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));}}
