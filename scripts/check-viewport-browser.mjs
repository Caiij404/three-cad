import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER_CHANNEL||'msedge',headless:true});
let dev,production,subpath;
const results=[];
const near=(a,b,tolerance=1e-6)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
async function checkFixture(mode,url){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:2}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(`${url}tests/browser/viewport.html`);await page.waitForFunction(()=>window.__viewport?.runtime.diagnostics().renders>0);
    const initial=await page.evaluate(()=>window.__viewport.runtime.diagnostics());assert.equal(initial.canvasCount,1);assert.equal(initial.state,'ready');assert.deepEqual(initial.camera.up,[0,0,1]);
    const webgl=await page.evaluate(()=>{const gl=window.__viewport.runtime.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return {version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),vendor:gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL??gl.VENDOR)};});
    await page.evaluate(()=>window.__viewport.runtime.standardView('XY'));
    const picks=[];
    for(const [world,id] of [[[-20,-10,0],'start'],[[0,-10,0],'line'],[[5,15,0],'circle'],[[-12.9289321881,27.0710678119,0],'arc']]){
      const actual=await page.evaluate(point=>{const r=window.__viewport.runtime,screen=r.project(point);return {screen,pick:r.pick(screen.x,screen.y)};},world);
      assert.equal(actual.pick?.id,id);picks.push({world,expected:id,...actual});
    }
    for(const [width,height] of [[900,420],[600,600],[1100,470]]){
      const actual=await page.evaluate(([w,h])=>{const harn=window.__viewport;harn.resize(w,h);const p=harn.runtime.project([0,-10,0]);return {pick:harn.runtime.pick(p.x,p.y),camera:harn.runtime.cameraView(),rect:harn.runtime.renderer.domElement.getBoundingClientRect().toJSON()};},[width,height]);
      assert.equal(actual.pick?.id,'line');near(actual.rect.width/actual.rect.height,width/height);near(actual.rect.width,width);near(actual.rect.height,height);
    }
    const location=await page.evaluate(()=>window.__viewport.runtime.project([0,-10,0]));
    const beforeCallbacks=await page.evaluate(()=>window.__viewport.selections.length);
    await page.mouse.click(location.x,location.y);assert.equal(await page.evaluate(()=>window.__viewport.selections.length),beforeCallbacks+1);
    assert.equal(await page.evaluate(()=>window.__viewport.selections.at(-1).pick.id),'line');
    await page.keyboard.down('Control');await page.mouse.click(location.x,location.y);await page.keyboard.up('Control');assert.equal(await page.evaluate(()=>window.__viewport.selections.at(-1).additive),true);
    await page.mouse.move(location.x,location.y);assert.equal(await page.evaluate(()=>window.__viewport.hovers.at(-1).id),'line');
    await page.evaluate(()=>window.__viewport.hidden(true));
    const hidden=await page.evaluate(()=>{const h=window.__viewport,p=h.runtime.project([0,-10,0]);h.runtime.setSelection(['fixture-sketch']);return h.runtime.pick(p.x,p.y);});
    assert.notEqual(hidden?.featureId,'fixture-sketch');await page.evaluate(()=>window.__viewport.hidden(false));
    const boxMetrics=await page.evaluate(()=>window.__viewport.addSolid());near(boxMetrics.signedVolume,8000,1e-8);
    const solidPick=await page.evaluate(()=>{const r=window.__viewport.runtime,p=r.project([60,0,20]);return r.pick(p.x,p.y);});assert.equal(solidPick?.id,'solid');
    await page.evaluate(()=>window.__viewport.runtime.standardView('iso'));
    const modelBefore=await page.evaluate(()=>window.__viewport.runtime.cameraView());
    const canvas=page.locator('canvas'),rect=await canvas.boundingBox(),x=rect.x+rect.width*.6,y=rect.y+rect.height*.55;
    await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+45,y+20,{steps:5});await page.mouse.up({button:'right'});
    const rotated=await page.evaluate(()=>window.__viewport.runtime.cameraView());assert.notDeepEqual(rotated.position,modelBefore.position);
    await page.mouse.move(x,y);await page.mouse.down({button:'middle'});await page.mouse.move(x+30,y+10,{steps:4});await page.mouse.up({button:'middle'});
    const panned=await page.evaluate(()=>window.__viewport.runtime.cameraView());assert.notDeepEqual(panned.target,rotated.target);
    await page.mouse.wheel(0,-100);await page.waitForFunction(zoom=>window.__viewport.runtime.cameraView().zoom>zoom,panned.zoom);
    const returnView=await page.evaluate(()=>window.__viewport.runtime.cameraView());
    await page.evaluate(()=>window.__viewport.runtime.enterSketch(window.__viewport.sketch));
    const sketchBefore=await page.evaluate(()=>window.__viewport.runtime.cameraView());
    const snapProbes=[];
    for(const factor of [0.5,1,2])for(const offset of [7.99,8,8.01]){
      const probe=await page.evaluate(([z,d])=>window.__viewport.snapProbe(z,d),[sketchBefore.zoom*factor,offset]);
      assert.equal(!!probe.sample,offset<=8);near(probe.roundTrip[0],-20);near(probe.roundTrip[1],-10);snapProbes.push(probe);
    }
    await page.evaluate(view=>{const r=window.__viewport.runtime;r.camera.zoom=view.zoom;r.camera.updateProjectionMatrix();},sketchBefore);
    await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+60,y+20,{steps:4});await page.mouse.up({button:'right'});
    assert.deepEqual(await page.evaluate(()=>window.__viewport.runtime.cameraView()),sketchBefore);
    const backgroundPick=await page.evaluate(()=>{const r=window.__viewport.runtime,p=r.project([60,0,20]);return r.pick(p.x,p.y);});assert.equal(backgroundPick,null);
    await page.evaluate(()=>window.__viewport.runtime.exitSketch());
    const restored=await page.evaluate(()=>window.__viewport.runtime.cameraView());
    for(const field of ['position','target','up'])restored[field].forEach((v,i)=>near(v,returnView[field][i],1e-8));near(restored.zoom,returnView.zoom);
    const lostDocument=await page.evaluate(()=>JSON.stringify(window.__viewport.doc));
    assert(await page.evaluate(()=>!!window.__viewport.contextExtension));
    // Both switches must survive context recovery independently.
    await page.evaluate(()=>{const r=window.__viewport.runtime;r.setInputEnabled(false);r.setNavigationEnabled(false);});
    await page.evaluate(()=>window.__viewport.contextExtension.loseContext());
    await page.waitForFunction(()=>window.__viewport.runtime.state==='lost');assert.equal(await page.evaluate(()=>JSON.stringify(window.__viewport.doc)),lostDocument);
    await page.waitForTimeout(300);
    await page.evaluate(()=>window.__viewport.contextExtension.restoreContext());
    await page.waitForFunction(()=>window.__viewport.runtime.state==='ready');
    const disabledView=await page.evaluate(()=>window.__viewport.runtime.cameraView());
    await page.mouse.move(x,y);await page.mouse.wheel(0,-100);await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(()=>window.__viewport.runtime.cameraView()),disabledView);
    const blockedPick=await page.evaluate(()=>{const r=window.__viewport.runtime;r.setNavigationEnabled(true);const p=r.project([0,-10,0]);return r.pick(p.x,p.y);});assert.equal(blockedPick,null);
    await page.mouse.wheel(0,-100);await page.waitForFunction(zoom=>window.__viewport.runtime.cameraView().zoom>zoom,disabledView.zoom);
    const navigationAfterRestore=await page.evaluate(()=>window.__viewport.runtime.cameraView());
    await page.evaluate(()=>window.__viewport.runtime.setInputEnabled(true));
    const afterRestorePick=await page.evaluate(()=>{const h=window.__viewport;h.restoreFixture();h.runtime.standardView('XY');const p=h.runtime.project([0,-10,0]);return h.runtime.pick(p.x,p.y);});assert.equal(afterRestorePick?.id,'line');
    const counts=await page.evaluate(()=>{
      const h=window.__viewport,counts=[];
      for(let i=0;i<20;i++){h.restoreFixture();h.runtime.renderNow();h.newSession(i);h.runtime.renderNow();counts.push(h.runtime.diagnostics());}
      return counts;
    });
    for(const c of counts){assert.equal(c.canvasCount,1);assert.equal(c.ownedGeometries,counts[0].ownedGeometries);assert.equal(c.gpuGeometries,counts[0].gpuGeometries);assert.equal(c.pickableCount,6);}
    await page.evaluate(()=>window.__viewport.restoreFixture());
    const post=await page.evaluate(()=>{const r=window.__viewport.runtime;r.standardView('XY');return r.project([0,-10,0]);});
    const postCallbacks=await page.evaluate(()=>window.__viewport.selections.length);await page.mouse.click(post.x,post.y);assert.equal(await page.evaluate(()=>window.__viewport.selections.length),postCallbacks+1);
    const final=await page.evaluate(()=>{const r=window.__viewport.runtime;r.dispose();r.dispose();return r.diagnostics();});assert.equal(final.canvasCount,0);assert.equal(final.ownedGeometries,0);assert.equal(final.ownedMaterials,0);
    assert.equal(errors.length,0,errors.join('\n'));
    results.push({mode,fixture:'actual Three/WebGL2, CSS-pixel projection/picking, real BSP solid',picks,boxVolume:boxMetrics.signedVolume,inputControls:true,
      webgl,snapProbes,contextLossRestored:true,projectPreserved:true,inputAndNavigationIndependentAfterRestore:{disabledView,navigationAfterRestore,blockedPick},twentyResets:{counts:counts.map(c=>({owned:c.ownedGeometries,gpu:c.gpuGeometries,canvas:c.canvasCount})),singleCallback:true},initial,final,browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function checkWorkspace(mode,url){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(url);await page.locator('[data-computation="ready"]').waitFor({timeout:15000});await page.locator('[data-viewport-state="ready"]').waitFor();assert.equal(await page.locator('canvas').count(),1);
    const ids=[];
    for(const plane of ['XY','XZ','YZ']){
      await page.getByRole('button',{name:`${plane} 平面`,exact:true}).click();await page.getByRole('button',{name:'新建草图',exact:true}).click();
      const node=page.locator('[data-feature-id]').last();const id=await node.getAttribute('data-feature-id');assert(!ids.includes(id));ids.push(id);
      assert(await page.getByRole('button',{name:'完成草图',exact:true}).isEnabled());assert(await page.getByRole('button',{name:'XY 平面',exact:true}).isDisabled());
      assert(await page.getByRole('button',{name:'线段',exact:true}).isEnabled());await page.getByRole('button',{name:'完成草图',exact:true}).click();
    }
    await page.locator(`[data-feature-id="${ids[0]}"]`).click();await page.getByRole('button',{name:'编辑草图',exact:true}).click();await page.getByRole('button',{name:'完成草图',exact:true}).click();
    await page.locator(`[data-feature-id="${ids[0]}"]`).click();await page.getByLabel('特征名称',{exact:true}).fill('学习 XY');await page.getByRole('button',{name:'应用特征名称',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'学习 XY',exact:true}).getAttribute('data-feature-id'),ids[0]);
    await page.getByRole('button',{name:'隐藏特征',exact:true}).click();await page.getByRole('button',{name:'学习 XY （隐藏）',exact:true}).waitFor();
    await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('button',{name:'学习 XY',exact:true}).waitFor();
    await page.getByRole('button',{name:'学习 XY',exact:true}).click();await page.getByRole('button',{name:'删除特征',exact:true}).click();assert.equal(await page.locator(`[data-feature-id="${ids[0]}"]`).count(),0);
    await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await page.locator(`[data-feature-id="${ids[0]}"]`).count(),1);
    await page.getByRole('button',{name:'XY 视图',exact:true}).click();
    // Click inside XY away from the common intersection of all three empty sketch planes.
    const area=await page.locator('canvas').boundingBox();await page.mouse.click(area.x+area.width/2+50,area.y+area.height/2-50);
    try{await page.waitForFunction(id=>document.querySelector(`[data-feature-id="${id}"]`)?.getAttribute('aria-pressed')==='true',ids[0],{timeout:3000});}
    catch(cause){await page.screenshot({path:'.research/T-103-pick-failure.png',fullPage:true});console.error({area,ids,pressed:await page.locator('[aria-pressed="true"]').allTextContents(),status:await page.locator('.workspace-status').textContent(),alerts:await page.getByRole('alert').allTextContents()});throw cause;}
    await page.getByRole('button',{name:'技术实验',exact:true}).click();await page.getByRole('button',{name:'工作区',exact:true}).click();await page.locator('[data-computation="ready"]').waitFor({timeout:15000});await page.locator('[data-viewport-state="ready"]').waitFor();assert.equal(await page.locator('canvas').count(),1);
    const widths=[];
    for(const width of [1280,1024,390]){await page.setViewportSize({width,height:900});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);widths.push(width);}
    await page.setViewportSize({width:1280,height:900});
    if(mode==='production-root')await page.screenshot({path:'.research/T-103-workspace.png',fullPage:true});
    for(let i=0;i<20;i++){
      await page.getByRole('button',{name:'XY 平面',exact:true}).click();await page.getByRole('button',{name:'新建草图',exact:true}).click();await page.getByRole('button',{name:'完成草图',exact:true}).click();
      const previousId=await page.locator('[aria-label="CAD 工作区"]').getAttribute('data-project-id');
      await page.getByRole('button',{name:'新建',exact:true}).click();await page.getByRole('button',{name:'丢弃修改并新建',exact:true}).click();
      assert.notEqual(await page.locator('[aria-label="CAD 工作区"]').getAttribute('data-project-id'),previousId);assert.equal(await page.locator('canvas').count(),1);assert.equal(await page.locator('[data-feature-id]').count(),0);
      assert(await page.getByRole('button',{name:'撤销',exact:true}).isDisabled());
    }
    assert.equal(errors.length,0,errors.join('\n'));results.push({mode,workspace:true,threePlaneSketchIds:ids,createEnterExitReeditRenameHideDeleteUndo:true,bidirectionalTreePick:true,twentyNewProjects:true,viewRemount:true,widths,browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function noWebGL(url){
  const context=await browser.newContext(),page=await context.newPage();
  try{
    await page.addInitScript(()=>{window.__blockWebGL=true;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'&&window.__blockWebGL?null:original.call(this,kind,...args);};});
    await page.goto(url);await page.getByRole('heading',{name:'视口不可用',exact:true}).waitFor();assert(await page.getByRole('button',{name:'重试视口',exact:true}).isEnabled());
    assert.equal(await page.locator('canvas').count(),0);const id=await page.locator('[aria-label="CAD 工作区"]').getAttribute('data-project-id');
    await page.evaluate(()=>{window.__blockWebGL=false;});await page.getByRole('button',{name:'重试视口',exact:true}).click();await page.locator('[data-viewport-state="ready"]').waitFor();assert.equal(await page.locator('canvas').count(),1);assert.equal(await page.locator('[aria-label="CAD 工作区"]').getAttribute('data-project-id'),id);
    results.push({mode:'WebGL-unavailable',forcedNullWebGL2Return:true,errorVisible:true,retryActuallyRecovered:true,projectIdPreserved:true,passed:true});
  }finally{await context.close();}
}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
try{
  dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();const devUrl=`http://127.0.0.1:${dev.httpServer.address().port}/`;
  await checkFixture('development',devUrl);await checkWorkspace('development',devUrl);
  const input={app:fileURLToPath(new URL('../index.html',import.meta.url)),viewport:fileURLToPath(new URL('../tests/browser/viewport.html',import.meta.url))};
  await build({root,build:{outDir:'.research/dist-viewport',emptyOutDir:true,rolldownOptions:{input}}});
  production=await preview({root,build:{outDir:'.research/dist-viewport'},preview:{host:'127.0.0.1',port:0}});const prodUrl=`http://127.0.0.1:${production.httpServer.address().port}/`;
  await checkFixture('production-root',prodUrl);await checkWorkspace('production-root',prodUrl);await noWebGL(prodUrl);
  await build({root,base:'/cad/',build:{outDir:'.research/dist-viewport-cad',emptyOutDir:true,rolldownOptions:{input}}});
  subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-viewport-cad'},preview:{host:'127.0.0.1',port:0}});const cadUrl=`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`;
  await checkFixture('production-/cad/',cadUrl);await checkWorkspace('production-/cad/',cadUrl);
  writeFileSync(new URL(process.env.VIEWPORT_EVIDENCE_PATH ?? '../docs/learning/evidence/T-103-viewport-browser.json',import.meta.url),JSON.stringify({task:process.env.VIEWPORT_EVIDENCE_TASK ?? 'T-103',executedAt:new Date().toISOString(),command:'npm run check:viewport',
    environment:{node:process.version,browser:browser.version(),three:'0.186.1',dpr:2},results,passed:true,
    limitations:['Empty sketch lifecycle in app; drawing and generic geometry pipeline unavailable.','Controlled fixture page measures actual WebGL resources; 20 small resets do not prove long-term driver heap stability.']},null,2)+'\n');
  console.log('PASS: actual viewport, picking, controls, WebGL loss/rebuild, 20 resets and empty sketch lifecycle across dev/root/cad.');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
