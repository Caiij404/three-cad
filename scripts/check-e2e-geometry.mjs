import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { launchBrowserUi } from './browser-ui-port.mjs';
import { change, documentData, draw, editWidth, extrude, feature, finish, fresh, open, ready, rectangle, save, solidMetrics, start, volume } from './e2e-ui-steps.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),results=[];
async function boolean(ui,a,b,operation) {
  await feature(ui,a);await ui.click('布尔');
  await ui.choose('布尔主体 A',a);await ui.choose('布尔工具 B',b);await ui.choose('布尔操作',operation);
  await change(ui,()=>ui.click('确认布尔'));
  return (await documentData(ui)).features.at(-1);
}
async function authority(ui) {
  const document=await documentData(ui),metrics={};
  for(const f of document.features.filter(f=>f.kind!=='sketch'))metrics[f.id]=await solidMetrics(ui,f.id);
  return{document,metrics};
}
function bounds(actual,axis,min,max) {
  assert(Math.abs(actual.bounds.min[axis]-min)<=1e-6&&Math.abs(actual.bounds.max[axis]-max)<=1e-6);
}
async function booleans(ui) {
  const a=await rectangle(ui,{width:20,height:20});await finish(ui);const solidA=await extrude(ui,20);
  const b=await rectangle(ui,{x:10,width:20,height:20});await finish(ui);const solidB=await extrude(ui,20);
  const joined=await boolean(ui,solidA.id,solidB.id,'union');
  const difference=await boolean(ui,solidA.id,solidB.id,'subtract');
  const reverse=await boolean(ui,solidB.id,solidA.id,'subtract');
  const intersection=await boolean(ui,solidA.id,solidB.id,'intersect');
  const initial=await authority(ui),ids=initial.document.features.map(f=>f.id);
  volume(initial.metrics[solidA.id],8000);volume(initial.metrics[solidB.id],8000);
  for(const [f,expected]of[[joined,12000],[difference,4000],[reverse,4000],[intersection,4000]])volume(initial.metrics[f.id],expected);
  bounds(initial.metrics[difference.id],0,0,10);bounds(initial.metrics[reverse.id],0,20,30);
  await editWidth(ui,a,25);const edited=await authority(ui);
  assert.deepEqual(edited.document.features.map(f=>f.id),ids);
  for(const [f,expected]of[[solidA,10000],[joined,12000],[difference,4000],[reverse,2000],[intersection,6000]])volume(edited.metrics[f.id],expected);
  bounds(edited.metrics[difference.id],0,0,10);bounds(edited.metrics[reverse.id],0,25,30);
  const downloaded=await save(ui);const saved=await authority(ui);
  await ui.reload();await ready(ui);await open(ui,downloaded.path);
  assert.deepEqual(await authority(ui),saved);
  // Cold file reconstruction must still permit later parameter propagation.
  await editWidth(ui,a,26);volume(await solidMetrics(ui,intersection.id),6400);
  await change(ui,()=>ui.click('撤销'));assert.deepEqual(await authority(ui),saved);
  await feature(ui,a.sketchId);await ui.click('删除特征');
  await ui.wait(()=>document.querySelector('dialog.delete-feature-dialog[open]'));
  const affected=await ui.evaluate(()=>[...document.querySelectorAll('dialog.delete-feature-dialog li')].map(e=>e.textContent));
  assert.equal(affected.length,5);
  await change(ui,()=>ui.click('级联删除来源及后代'));
  const cascaded=await authority(ui);
  assert.deepEqual(cascaded.document.features.map(f=>f.id),[b.sketchId,solidB.id]);
  await change(ui,()=>ui.click('撤销'));assert.deepEqual(await authority(ui),saved);
  await change(ui,()=>ui.click('重做'));assert.deepEqual(await authority(ui),cascaded);
  await change(ui,()=>ui.click('撤销'));assert.deepEqual(await authority(ui),saved);
  return{sourceA:a,sourceB:b,solids:{a:solidA.id,b:solidB.id,union:joined.id,difference:difference.id,reverse:reverse.id,intersection:intersection.id},initialMetrics:initial.metrics,editedMetrics:edited.metrics,stableIds:true,actualJsonDownload:downloaded.name,exactFileReconstruction:true,continuedWidth26IntersectionMm3:6400,affectedCount:affected.length,exactCascadeUndoRedo:true,passed:true};
}
async function profiles(ui) {
  const cases=[];
  for(const plane of ['XY','XZ','YZ']) {
    await fresh(ui);await start(ui,plane);await draw(ui,'矩形',[[0,0],[40,30]]);await draw(ui,'矩形',[[15,10],[25,20]]);await finish(ui);
    const hole=await extrude(ui,10),positive=await solidMetrics(ui,hole.id);volume(positive,11000);
    assert.equal(hole.region.holeEntityIds.length,1);
    await ui.fill('现有拉伸深度 (mm)',-10);await change(ui,()=>ui.click('应用拉伸参数'));
    const negative=await solidMetrics(ui,hole.id);volume(negative,11000);
    const axis={XY:2,XZ:1,YZ:0}[plane],positiveMin=plane==='XZ'?-10:0,negativeMin=plane==='XZ'?0:-10;
    bounds(positive,axis,positiveMin,positiveMin+10);bounds(negative,axis,negativeMin,negativeMin+10);
    cases.push({kind:'hole',plane,positive,negative,expectedVolumeMm3:11000,oneHole:true,passed:true});
  }
  for(const kind of ['circle','half']) {
    await fresh(ui);await start(ui);
    if(kind==='circle')await draw(ui,'圆',[[0,0],[10,0]]);
    else {await draw(ui,'圆弧',[[-10,0],[0,10],[10,0]]);await draw(ui,'线段',[[10,0],[-10,0]]);}
    await finish(ui);const solid=await extrude(ui,10),actual=await solidMetrics(ui,solid.id),expected=(kind==='circle'?1000:500)*Math.PI;
    volume(actual,expected,expected*.01);
    cases.push({kind,plane:'XY',actual,expectedVolumeMm3:expected,relativeError:Math.abs(actual.signedVolume-expected)/expected,toleranceRelative:.01,passed:true});
  }
  return cases;
}
async function close(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
let production,subpath;
try {
  await build({root});production=await preview({root,preview:{host:'127.0.0.1',port:0}});
  await build({root,base:'/cad/',build:{outDir:'.research/dist-e2e-geometry-cad',emptyOutDir:true}});
  subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-e2e-geometry-cad'},preview:{host:'127.0.0.1',port:0}});
  for(const kind of (process.env.E2E_BROWSER_KINDS??'chrome,edge,firefox').split(',')) {
    for(const [mode,url]of[['production-root',`http://127.0.0.1:${production.httpServer.address().port}/`],['production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`]]) {
      const ui=await launchBrowserUi(kind);
      try {
        await ui.navigate(url);await ready(ui);await ui.resize(1280,720);
        const booleanFlow=await booleans(ui),profileFlow=await profiles(ui);
        results.push({kind,version:ui.version,mode,booleanFlow,profileFlow,passed:true});
        console.log(`PASS ${kind} ${ui.version} ${mode}: UI E2E-02 / exact file / cascade / E2E-03 holes three planes ± and curves`);
      } catch(cause) {
        await ui.screenshot(`.research/T-403B1-${kind}-failure.png`);
        console.error(await ui.evaluate(()=>({status:document.querySelector('.workspace-status')?.textContent,alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)})));
        throw cause;
      } finally {await ui.close();}
    }
  }
  writeFileSync(process.env.E2E_GEOMETRY_EVIDENCE_PATH??'docs/learning/evidence/T-403B1-e2e-geometry.json',JSON.stringify({task:process.env.E2E_GEOMETRY_TASK??'T-403B1',scenarios:['E2E-02','E2E-03'],executedAt:new Date().toISOString(),command:'npm run check:e2e-geometry',environment:{node:process.version,platform:process.platform,three:'0.186.1'},results,tolerances:{straightVolumeMm3:1e-6,boundsMm:1e-6,curvedVolumeRelative:.01},passed:true,limitations:['All features are drawn through native UI actions; no prebuilt documents are injected.','Performance and long resource acceptance remain T-403C.']},null,2)+'\n');
} finally {await close(production);await close(subpath);}
