import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { launchBrowserUi, pause } from './browser-ui-port.mjs';
import { change, documentData, extrude, feature, finish, fresh, objects, ready, rectangle, revision, save, sketchData, solidMetrics, volume } from './e2e-ui-steps.mjs';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),results=[];
async function install(ui) {
  await ui.evaluate(()=>{
    window.__e2eErrors=[];window.addEventListener('error',e=>window.__e2eErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__e2eErrors.push(String(e.reason)));
    window.__e2eReplies=[];window.__e2eHold='';window.__e2ePorts=0;
    const NativeWorker=Worker,held=new Set();
    window.Worker=class extends NativeWorker {
      constructor(...args) {super(...args);window.__e2ePorts++;this.addEventListener('message',event=>{
        const reply=event.data,key=`${reply.sessionId}:${reply.requestId}`;
        if(!reply.ok||!held.has(key))return;event.stopImmediatePropagation();
        window.__e2eReplies.push({output:reply.output,release:()=>{held.delete(key);this.dispatchEvent(new MessageEvent('message',{data:reply}));}});
      },true);}
      postMessage(data,...args) {
      if((window.__e2eHold==='extrusion'&&data.input?.kind==='sketch-extrusion')||(window.__e2eHold==='solve'&&data.input?.sketch))held.add(`${data.sessionId}:${data.requestId}`);
      super.postMessage(data,...args);
      }
    };
    window.__releaseE2e=()=>{window.__e2eHold='';for(const item of window.__e2eReplies.splice(0))item.release();};
    const put=IDBObjectStore.prototype.put;window.__e2eQuota=false;
    IDBObjectStore.prototype.put=function(...args){if(window.__e2eQuota)throw new DOMException('Intentional quota experiment','QuotaExceededError');return put.apply(this,args);};
  });
}
async function state(ui) {
  return{document:await documentData(ui),revision:await revision(ui),history:await ui.evaluate(()=>Object.fromEntries([...document.querySelectorAll('button')].filter(b=>['撤销','重做'].includes(b.textContent.trim())).map(b=>[b.textContent.trim(),!b.disabled])))};
}
async function alert(ui,pattern,timeout=15000){await ui.wait(pattern=>[...document.querySelectorAll('[role="alert"]')].some(el=>new RegExp(pattern).test(el.textContent)),pattern,timeout);}
async function held(ui,kind){await ui.evaluate(kind=>{window.__e2eHold=kind;window.__e2eReplies=[];},kind);}
async function meshReply(ui){await ui.wait(()=>window.__e2eReplies.length>0);return meshMetrics(await ui.evaluate(()=>({positions:Array.from(window.__e2eReplies[0].output.positions)})));}
async function released(ui){await ui.evaluate(()=>window.__releaseE2e());await pause(100);}
async function conflictAndFiles(ui,ids,solid) {
  await feature(ui,ids.sketchId);await ui.click('编辑草图');const old=await state(ui),sketch=await sketchData(ui);
  await objects(ui);await ui.clickCss(`[data-entity-id="${sketch.entities[0].id}"]`);await ui.click('约束');await ui.choose('约束类型','length');await ui.fill('新约束数值 (mm)',50);await ui.click('添加约束');
  await alert(ui,'冲突|inconsistent');assert.deepEqual(await state(ui),old);
  await ui.click('完成草图');volume(await solidMetrics(ui,solid.id),12000);
  const valid=await save(ui),baseline=await state(ui);assert.deepEqual(valid.document,baseline.document);
  const invalid=[];
  for(const [name,text,code]of[['corrupt','{','INVALID_JSON'],['future',JSON.stringify({...valid.document,schemaVersion:2}),'UNSUPPORTED_SCHEMA']]) {
    const path=resolve(ui.directory,`${name}.tcad.json`);writeFileSync(path,text);
    await ui.upload(path);await alert(ui,code);assert.deepEqual(await state(ui),baseline);invalid.push({name,code,exactAuthority:true});
  }
  return{conflictRejectedWithoutHistory:true,oldSolidStillSavedActualFile:valid.name,oldVolumeMm3:12000,invalid,passed:true};
}
async function timeout(ui,solid) {
  await feature(ui,solid.id);const before=await state(ui),ports=await ui.evaluate(()=>window.__e2ePorts);
  await held(ui,'extrusion');await ui.fill('现有拉伸深度 (mm)',20);const start=Date.now();await ui.click('应用拉伸参数');
  const actual=await meshReply(ui);volume(actual,24000);
  assert.deepEqual(await documentData(ui),before.document);assert.equal(await revision(ui),before.revision);
  await alert(ui,'WORKER_TIMEOUT',16000);const elapsed=Date.now()-start;assert(elapsed>=9900);
  assert.deepEqual(await state(ui),before);volume(await solidMetrics(ui,solid.id),12000);
  await released(ui);assert.deepEqual(await state(ui),before);
  await ui.fill('现有拉伸深度 (mm)',20);await change(ui,()=>ui.click('应用拉伸参数'));volume(await solidMetrics(ui,solid.id),24000);
  assert((await ui.evaluate(()=>window.__e2ePorts))>ports);
  await change(ui,()=>ui.click('撤销'));volume(await solidMetrics(ui,solid.id),12000);
  return{actualHeldVolumeMm3:actual.signedVolume,elapsedMs:elapsed,oldAuthorityHistoryExact:true,lateReplyAfterTerminationIgnored:true,newWorkerRetryVolumeMm3:24000,undoVolumeMm3:12000,passed:true};
}
async function storageAndViewport(ui,solid) {
  await ui.wait(()=>document.querySelector('[data-recovery-state="saved"]'));
  const read=()=>ui.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('three-cad-vue',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('recovery','readonly'),get=tx.objectStore('recovery').get('last-project');let record;get.onsuccess=()=>{record=get.result;};tx.oncomplete=()=>{db.close();resolve(record);};tx.onabort=()=>{db.close();reject(tx.error);};};}));
  const old=await read();await ui.evaluate(()=>{window.__e2eQuota=true;});await ui.fill('项目名称','存储故障后仍可保存');await change(ui,()=>ui.click('应用名称'));
  await alert(ui,'RECOVERY_QUOTA');assert.deepEqual(await read(),old);
  const file=await save(ui);assert.deepEqual(file.document,await documentData(ui));
  await ui.evaluate(()=>{window.__e2eQuota=false;});await ui.click('重试自动恢复');await ui.wait(()=>document.querySelector('[data-recovery-state="saved"]'));
  assert.deepEqual(JSON.parse((await read()).text),await documentData(ui));
  await feature(ui,solid.id);const before=await state(ui),metrics=await solidMetrics(ui,solid.id);
  await ui.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await ui.wait(()=>document.querySelector('[data-viewport-state="lost"]'));
  assert.deepEqual(await documentData(ui),before.document);assert.equal(await revision(ui),before.revision);
  await ui.click('重试视口');await ui.wait(()=>document.querySelector('[data-viewport-state="ready"]'));
  assert.deepEqual(await state(ui),before);assert.deepEqual(await solidMetrics(ui,solid.id),metrics);
  await ui.fill('现有拉伸深度 (mm)',11);await change(ui,()=>ui.click('应用拉伸参数'));volume(await solidMetrics(ui,solid.id),13200);
  await change(ui,()=>ui.click('撤销'));assert.deepEqual(await documentData(ui),before.document);assert.deepEqual(await solidMetrics(ui,solid.id),metrics);
  return{realIndexedDbOldRecordPreserved:true,quotaMessage:'RECOVERY_QUOTA',manualDownloadedDuringQuota:file.name,actualStorageRetry:true,actualWebglContextLoss:true,exactDocumentMetricsHistoryAfterRetry:true,continuedDepth11VolumeMm3:13200,passed:true};
}
async function lateDimensions(ui,ids,solid) {
  await feature(ui,ids.sketchId);await ui.click('编辑草图');const row=`[data-constraint-id="${ids.widthId}"]`,before=await state(ui);
  for(let i=41;i<=70;i++)await ui.fill('约束数值 (mm)',i,row);
  await held(ui,'extrusion');await ui.clickCss(`${row} button`,'应用数值');const actual=await meshReply(ui);volume(actual,21000);
  await ui.key('Escape');assert.deepEqual(await state(ui),before);
  await fresh(ui);const empty=await state(ui);await released(ui);assert.deepEqual(await state(ui),empty);assert.equal(empty.document.features.length,0);
  return{numericInputs:30,actualHeldWidth70VolumeMm3:actual.signedVolume,escapeNoHistory:true,switchedProjectRejectsLateMesh:true,passed:true};
}
async function lateDrag(ui) {
  const ids=await rectangle(ui);const row=`[data-constraint-id="${ids.widthId}"]`;
  await change(ui,()=>ui.clickCss(`${row} button`,'删除约束'));await ui.click('选择');const before=await state(ui);
  const box=await ui.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
  const scale=box.height/(70*Math.SQRT2*1.2),from={x:box.x+box.width/2+40*scale,y:box.y+box.height/2-30*scale},to={x:from.x+10*scale,y:from.y};
  await held(ui,'solve');await ui.drag(from,to,30);await ui.wait(()=>window.__e2eReplies.length>0);
  const actual=await ui.evaluate(()=>window.__e2eReplies[0].output);assert.equal(actual.status,'under-constrained');assert.equal(actual.dof,1);
  assert(Object.values(actual.residuals).every(value=>value<=1e-5));
  const inputBefore=(await documentData(ui)).features[0];assert.deepEqual(inputBefore,before.document.features[0]);
  assert(actual.sketch.points.every(p=>p.position.every(Number.isFinite)));
  await ui.key('Escape');await fresh(ui);const empty=await state(ui);await released(ui);assert.deepEqual(await state(ui),empty);
  const {sketch,...diagnostics}=actual;
  return{nativePointerMoves:30,heldActualWasmDiagnostics:diagnostics,heldActualPoints:sketch.points,sourceNotCommittedDuringPending:true,switchedProjectRejectsLateSolve:true,passed:true};
}
async function close(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
let production,subpath;
try {
  await build({root});production=await preview({root,preview:{host:'127.0.0.1',port:0}});
  await build({root,base:'/cad/',build:{outDir:'.research/dist-e2e-failures-cad',emptyOutDir:true}});subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-e2e-failures-cad'},preview:{host:'127.0.0.1',port:0}});
  for(const kind of (process.env.E2E_BROWSER_KINDS??'chrome,edge,firefox').split(','))for(const [mode,url]of[['production-root',`http://127.0.0.1:${production.httpServer.address().port}/`],['production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`]]) {
    const ui=await launchBrowserUi(kind);
    try {
      await ui.navigate(url);await ready(ui);await ui.resize(1280,720);await install(ui);
      const ids=await rectangle(ui);await finish(ui);const solid=await extrude(ui,10);
      const conflictFiles=await conflictAndFiles(ui,ids,solid),workerTimeout=await timeout(ui,solid),storageViewport=await storageAndViewport(ui,solid),dimensions=await lateDimensions(ui,ids,solid),drag=await lateDrag(ui);
      const errors=await ui.evaluate(()=>window.__e2eErrors);assert.deepEqual(errors,[]);
      results.push({kind,version:ui.version,mode,conflictFiles,workerTimeout,storageViewport,dimensions,drag,unhandledErrors:errors,passed:true});
      console.log(`PASS ${kind} ${ui.version} ${mode}: real conflict / bad files / 10s timeout / IDB quota / WebGL / late dimensions and 30-move drag`);
    } catch(cause) {await ui.screenshot(`.research/T-403B2-${kind}-failure.png`);console.error(await ui.evaluate(()=>({status:document.querySelector('.workspace-status')?.textContent,alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)})));throw cause;}
    finally {await ui.close();}
  }
  writeFileSync(process.env.E2E_FAILURES_EVIDENCE_PATH??'docs/learning/evidence/T-403B2-e2e-failures.json',JSON.stringify({task:process.env.E2E_FAILURES_TASK??'T-403B2',scenario:'E2E-04',executedAt:new Date().toISOString(),command:'npm run check:e2e-failures',environment:{node:process.version,platform:process.platform,three:'0.186.1'},results,tolerances:{volumeMm3:1e-6,actualTimeoutMinimumMs:9900},passed:true,limitations:['Fault injection holds real computed Worker replies and deliberately throws native IDB quota; no geometry is synthesized.','Performance and long resource acceptance remain C.']},null,2)+'\n');
} finally {await close(production);await close(subpath);}
