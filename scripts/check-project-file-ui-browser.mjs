import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
import { OrthographicCamera, Vector3 } from 'three';
import createModule from '../public/wasm/slvs.mjs';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject, documentIds } from '../src/core/model/document.ts';
import { serializeProject } from '../src/core/model/validate-document.ts';
import { featureRecompute } from '../src/app/feature-recompute.ts';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { domainRectangle } from '../src/experiments/domain-solver-fixtures.ts';
import { BASE_PLANES, toWorld } from '../src/core/geometry/plane.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),results=[],module=await createModule();
async function fixture(plane='XY',operation='intersect') {
  const engine=new ProjectEngine(createEmptyProject(),{recompute:featureRecompute(async input=>solveDomainSketch(module,input),async input=>runSolid(input))});
  for(const [prefix,x] of [['a',0],['b',10]]) {
    const s=domainRectangle(20),ids=new Set(documentIds({...engine.document,features:[s]}).slice(1));
    const rename=v=>typeof v==='string'&&ids.has(v)?`${prefix}-${v}`:Array.isArray(v)?v.map(rename):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([key,value])=>[key,rename(value)])):v;
    const sketch=rename(s);sketch.id=prefix;sketch.plane=structuredClone(BASE_PLANES[plane]);sketch.constraints.find(c=>c.id===`${prefix}-height`).value=20;
    sketch.constraints.find(c=>c.id===`${prefix}-base-fixed`).fixedPosition=[x,0];for(const p of sketch.points)p.position[0]+=x;
    await engine.execute({kind:'add-feature',feature:sketch});const solved=engine.document.features.find(f=>f.id===prefix);
    await engine.execute({kind:'add-feature',feature:{id:`solid-${prefix}`,kind:'extrude',name:`实体 ${prefix}`,visible:true,sketchId:prefix,region:selectSketchRegion(buildSketchRegions(solved)).definition,depth:20}});
  }
  await engine.execute({kind:'add-feature',feature:{id:'join',kind:'boolean',name:'结果',visible:true,operation,operandAId:'solid-a',operandBId:'solid-b'}});
  return engine.document;
}
const fixtures={};for(const plane of ['XY','XZ','YZ'])fixtures[plane]=await fixture(plane);
const browser=await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER_CHANNEL||'msedge',headless:true});let dev,production,subpath;
const json=async(page,id)=>JSON.parse(await page.locator(`[data-testid="${id}"]`).textContent()),doc=page=>json(page,'project-document-data');
const revision=async page=>Number((await page.locator('.workspace-status').textContent()).match(/revision (\d+)/)[1]);
async function change(page,action){const before=await revision(page);await action();await page.waitForFunction(r=>Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1])===r+1,before);}
async function allMetrics(page){const result={};for(const f of (await doc(page)).features.filter(f=>f.kind!=='sketch')){await page.locator(`[data-feature-id="${f.id}"]`).click();result[f.id]=await json(page,'committed-solid-metrics');}return result;}
const comparable=document=>({...document,view:null,updatedAt:''});
async function state(page){return{document:await doc(page),metrics:await allMetrics(page),revision:await revision(page),canUndo:!await page.getByRole('button',{name:'撤销',exact:true}).isDisabled(),canRedo:!await page.getByRole('button',{name:'重做',exact:true}).isDisabled()};}
function volume(actual,expected){assert(actual.closed&&actual.windingErrors===0);assert(Math.abs(actual.signedVolume-expected)<=1e-6,`${actual.signedVolume} != ${expected}`);}
async function upload(page,value,name='model.tcad.json',confirm=true){const before=await revision(page);await page.getByLabel('打开项目文件',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:serializeProject(value))});if(confirm){const button=page.getByRole('button',{name:'丢弃修改并打开',exact:true});if(await button.isVisible())await button.click();await page.waitForFunction(r=>Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1])===r+1,before);}}
async function save(page,acknowledge=true,shortcut=false){const download=page.waitForEvent('download');if(shortcut)await page.keyboard.press('Control+s');else await page.getByRole('button',{name:'保存',exact:true}).click();const file=await download,text=readFileSync(await file.path(),'utf8');await page.getByRole('dialog',{name:'确认下载文件已保存',exact:true}).waitFor();assert.match(await page.locator('.workspace-header').textContent(),/未保存的修改|未修改/);if(acknowledge)await page.getByRole('button',{name:'确认文件已保存',exact:true}).click();else await page.getByRole('button',{name:'继续保留修改',exact:true}).click();return{text,name:file.suggestedFilename(),document:JSON.parse(text)};}
async function pickFromSavedCamera(page,document,plane){
  const box=await page.locator('canvas').boundingBox(),v=document.view,camera=new OrthographicCamera(-60*box.width/box.height,60*box.width/box.height,60,-60,.01,100000);
  camera.position.fromArray(v.position);camera.up.fromArray(v.up);camera.zoom=v.zoom;camera.lookAt(new Vector3(...v.target));camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const world=toWorld(BASE_PLANES[plane],[15,10]).map((n,i)=>n+20*(BASE_PLANES[plane].u[(i+1)%3]*BASE_PLANES[plane].v[(i+2)%3]-BASE_PLANES[plane].u[(i+2)%3]*BASE_PLANES[plane].v[(i+1)%3]));
  const p=new Vector3(...world).project(camera),at={x:box.x+(p.x+1)*box.width/2,y:box.y+(1-p.y)*box.height/2};assert(p.x>-1&&p.x<1&&p.y>-1&&p.y<1);await page.mouse.click(at.x,at.y);assert.equal(await page.locator('[data-feature-id="join"]').getAttribute('aria-pressed'),'true');return{world,screen:at,selectedActualSolid:'join'};
}
async function install(context){await context.addInitScript(()=>{
  const read=File.prototype.text;File.prototype.text=async function(){if(window.__failRead)throw Error('read failure');const text=await read.call(this);if(window.__holdRead){window.__readHeld=true;await new Promise(resolve=>{window.__releaseRead=resolve;});}return text;};
  const make=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(window.__failDownload)throw Error('download failure');return make(blob);};
  window.__fileRequests=[];const NativeWorker=Worker;window.Worker=class extends NativeWorker{held=new Set();constructor(...args){super(...args);this.addEventListener('message',event=>{if(!event.data.ok||!this.held.has(event.data.requestId))return;event.stopImmediatePropagation();const data=event.data;window.__heldFileMesh={output:data.output,release:()=>{this.held.delete(data.requestId);this.dispatchEvent(new MessageEvent('message',{data}));}};},true);}postMessage(data,...args){if(data.input?.sketch||data.input?.kind==='mesh-boolean'){window.__fileRequests.push(data.input.kind??'solve');if(window.__holdFileMesh&&data.input?.kind==='sketch-extrusion')this.held.add(data.requestId);}super.postMessage(data,...args);}};
});}
async function roundtrip(page,url,plane){
  await upload(page,fixtures[plane]);const loaded=await doc(page);assert.deepEqual(loaded,fixtures[plane]);volume((await allMetrics(page)).join,4000);
  await page.getByRole('button',{name:'适应视图',exact:true}).click();const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.55);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+box.width*.55+12,box.y+box.height*.55+8);await page.mouse.up({button:'middle'});await page.mouse.wheel(0,-100);
  await page.waitForFunction(v=>JSON.stringify(JSON.parse(document.querySelector('[data-testid="project-document-data"]').textContent).view)!==v,JSON.stringify(loaded.view));
  const downloaded=await save(page);assert(!/(cache|diagnostics|history|pointer)/.test(Object.keys(downloaded.document).join(',')));const before=await state(page);assert.deepEqual(downloaded.document,before.document);assert.match(await page.locator('.workspace-header').textContent(),/未修改/);
  await page.reload();await page.locator('[data-computation="ready"]').waitFor();await page.locator('[data-viewport-state="ready"]').waitFor();await upload(page,downloaded.text);const reopened=await state(page);assert.deepEqual(reopened.document,before.document);assert.deepEqual(reopened.metrics,before.metrics);assert(!reopened.canUndo&&!reopened.canRedo);
  const picking=await pickFromSavedCamera(page,reopened.document,plane);
  await page.locator('[data-feature-id="a"]').click();await page.getByRole('button',{name:'编辑草图',exact:true}).click();const row=page.locator('[data-constraint-id="a-width"]');await row.getByLabel('约束数值 (mm)',{exact:true}).fill('25');await change(page,()=>row.getByRole('button',{name:'应用数值',exact:true}).click());await page.getByRole('button',{name:'完成草图',exact:true}).click();const edited=await state(page);volume(edited.metrics['solid-a'],10000);volume(edited.metrics.join,6000);
  await change(page,()=>page.getByRole('button',{name:'撤销',exact:true}).click());assert.deepEqual(comparable(await doc(page)),comparable(reopened.document));assert.deepEqual(await allMetrics(page),before.metrics);await change(page,()=>page.getByRole('button',{name:'重做',exact:true}).click());assert.deepEqual(comparable(await doc(page)),comparable(edited.document));
  return{plane,fileName:downloaded.name,savedCamera:before.document.view,exactDomainAndMeshMetrics:true,picking,afterEditVolumesMm3:{a:edited.metrics['solid-a'].signedVolume,intersection:edited.metrics.join.signedVolume},continuedEditUndoRedo:true,passed:true};
}
async function failures(page){
  const before=await state(page),bad=structuredClone(before.document);bad.schemaVersion=2;const missing=structuredClone(before.document);missing.features.find(f=>f.id==='solid-a').sketchId='absent';
  const invalid=[];for(const [name,text,code] of [['syntax','{','INVALID_JSON'],['future',JSON.stringify(bad),'UNSUPPORTED_SCHEMA'],['missing',JSON.stringify(missing),'REFERENCE_MISSING'],['nonfinite',JSON.stringify(before.document).replace('"zoom":'+before.document.view.zoom,'"zoom":1e309'),'SCHEMA_INVALID'],['large',' '.repeat(10*1024*1024+1),'FILE_TOO_LARGE']]){
    await upload(page,text,`${name}.tcad.json`,false);await page.locator('[data-file-status="error"]').filter({hasText:code}).waitFor();assert.deepEqual(await state(page),before);invalid.push({name,code,currentProjectExact:true});
  }
  await page.evaluate(()=>{window.__failRead=true;});await upload(page,fixtures.XY,'read.tcad.json',false);await page.locator('[data-file-status="error"]').filter({hasText:'FILE_READ_FAILED'}).waitFor();assert.deepEqual(await state(page),before);await page.evaluate(()=>{window.__failRead=false;window.__failDownload=true;});await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('[data-file-status="error"]').filter({hasText:'FILE_DOWNLOAD_FAILED'}).waitFor();assert.deepEqual(await state(page),before);await page.evaluate(()=>{window.__failDownload=false;});
  // Read an actual file, then cancel while only its returned text is held.
  await page.evaluate(()=>{window.__holdRead=true;});await upload(page,fixtures.XY,'held-read.tcad.json',false);await page.waitForFunction(()=>window.__readHeld);await page.getByRole('button',{name:'取消打开',exact:true}).click();await page.evaluate(()=>{window.__holdRead=false;window.__releaseRead();});assert.deepEqual(await state(page),before);
  await upload(page,fixtures.XY,'cancel.tcad.json',false);await page.getByRole('dialog',{name:'打开将替换未保存的项目',exact:true}).waitFor();await page.keyboard.press('Enter');assert.deepEqual(await state(page),before);
  await page.evaluate(()=>{window.__holdFileMesh=true;});await upload(page,fixtures.XY,'held-mesh.tcad.json',false);await page.getByRole('button',{name:'丢弃修改并打开',exact:true}).click();await page.waitForFunction(()=>!!window.__heldFileMesh);const actual=meshMetrics(await page.evaluate(()=>window.__heldFileMesh.output));volume(actual,8000);assert(await page.getByRole('button',{name:'撤销',exact:true}).isDisabled());await page.getByRole('button',{name:'取消打开',exact:true}).click();await page.evaluate(()=>{window.__holdFileMesh=false;window.__heldFileMesh.release();});assert.deepEqual(await state(page),before);
  const malicious=structuredClone(fixtures.XY);malicious.name='<img src=x onerror="window.__injected=true">';await upload(page,malicious,'<script>evil.tcad.json');assert.equal(await page.locator('.workspace-header h1').textContent(),malicious.name);assert.equal(await page.locator('.workspace-header img').count(),0);assert(!await page.evaluate(()=>window.__injected));
  await page.getByLabel('项目名称',{exact:true}).fill('下载待确认');await change(page,()=>page.getByRole('button',{name:'应用名称',exact:true}).click());await page.getByLabel('项目名称',{exact:true}).focus();await save(page,false,true);assert.match(await page.locator('.workspace-header').textContent(),/未保存的修改/);
  const beforeNew=await doc(page);await page.getByRole('button',{name:'新建',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'保存后新建',exact:true}).click();const saved=await download;assert.equal(JSON.parse(readFileSync(await saved.path(),'utf8')).id,beforeNew.id);await page.getByRole('button',{name:'确认文件已保存',exact:true}).click();assert.equal((await doc(page)).features.length,0);assert.notEqual((await doc(page)).id,beforeNew.id);
  await page.getByLabel('项目名称',{exact:true}).fill('未保存离页');await change(page,()=>page.getByRole('button',{name:'应用名称',exact:true}).click());
  const leaving=page.waitForEvent('dialog');await page.reload();assert.equal((await leaving).type(),'beforeunload');await page.locator('[data-computation="ready"]').waitFor();
  return{invalid,readAndDownloadErrorsPreserveProject:true,defaultOpenCancel:true,lateActualMeshVolumeMm3:actual.signedVolume,readAndMeshCancelPreserveHistory:true,namesRenderAsData:true,unconfirmedDownloadKeepsDirty:true,saveBeforeNewRequiresDownloadAcknowledgement:true,dirtyBeforeUnloadConfirmed:true,passed:true};
}
async function check(mode,url){const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});await install(context);const page=await context.newPage(),errors=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.type());await d.accept();});
  try{await page.goto(url);await page.locator('[data-computation="ready"]').waitFor({timeout:15000});await page.locator('[data-viewport-state="ready"]').waitFor();const planes=[];for(const plane of ['XY','XZ','YZ'])planes.push(await roundtrip(page,url,plane));const errorPaths=await failures(page);assert.deepEqual(errors,[]);results.push({mode,planes,errorPaths,browserErrors:errors,beforeUnloadDialogs:dialogs,passed:true});console.log(`PASS ${mode}: real downloads/reopen/camera picking/3-plane edits/errors/cancellation`);}
  catch(cause){await page.screenshot({path:'.research/T-401B-failure.png',fullPage:true});console.error(await page.getByRole('alert').allTextContents());throw cause;}finally{await context.close();}}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
try{dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();await check('development',`http://127.0.0.1:${dev.httpServer.address().port}/`);
  production=await preview({root,preview:{host:'127.0.0.1',port:0}});await check('production-root',`http://127.0.0.1:${production.httpServer.address().port}/`);
  await build({root,base:'/cad/',build:{outDir:'.research/dist-file-ui-cad',emptyOutDir:true}});subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-file-ui-cad'},preview:{host:'127.0.0.1',port:0}});await check('production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-401B-file-ui-browser.json',JSON.stringify({task:'T-401B',executedAt:new Date().toISOString(),command:'npm run check:project-file-ui:browser',environment:{node:process.version,platform:process.platform,browser:browser.version()},results,tolerances:{volumeMm3:1e-6},passed:true,limitations:['Edge only; final three-browser/performance still pending.','IndexedDB recovery belongs to T-401C.','Standard Blob downloads require user acknowledgement; no disk-write completion claimed.']},null,2)+'\n');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
