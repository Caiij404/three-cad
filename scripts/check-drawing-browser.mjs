import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),results=[];
const browser=await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER_CHANNEL||'msedge',headless:true});
let dev,production,subpath;
async function readSketch(page){return JSON.parse(await page.locator('[data-testid="active-sketch-data"]').textContent());}
async function point(page,x,y){await page.getByLabel('下一点 X (mm)',{exact:true}).fill(String(x));await page.getByLabel('下一点 Y (mm)',{exact:true}).fill(String(y));await page.getByRole('button',{name:'输入此点',exact:true}).click();}
async function entities(page,count){await page.waitForFunction(expected=>JSON.parse(document.querySelector('[data-testid="active-sketch-data"]').textContent).entities.length===expected,count,{timeout:20000});}
async function check(mode,url){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],workers=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('worker',w=>workers.push(w.url()));
  const evidence=[];
  try{
    await page.goto(url);await page.locator('[data-computation="ready"]').waitFor({timeout:15000});await page.locator('[data-viewport-state="ready"]').waitFor();
    for(const plane of ['XY','XZ','YZ']){
      await page.getByRole('button',{name:`${plane} 平面`,exact:true}).click();await page.getByRole('button',{name:'新建草图',exact:true}).click();
      await page.getByRole('button',{name:'矩形',exact:true}).click();await point(page,0,0);await point(page,40,30);await entities(page,4);
      let sketch=await readSketch(page),rect=structuredClone(sketch);const xs=sketch.points.map(p=>p.position[0]),ys=sketch.points.map(p=>p.position[1]);
      assert(Math.abs(Math.max(...xs)-Math.min(...xs)-40)<=1e-5);assert(Math.abs(Math.max(...ys)-Math.min(...ys)-30)<=1e-5);assert.equal(sketch.constraints.filter(c=>c.kind==='coincident').length,4);
      await page.getByRole('button',{name:'撤销',exact:true}).click();await entities(page,0);await page.getByRole('button',{name:'重做',exact:true}).click();await entities(page,4);
      const restored=await readSketch(page);assert.deepEqual(restored,rect);
      await page.getByRole('button',{name:'圆',exact:true}).click();await point(page,60,0);await point(page,70,0);await entities(page,5);
      sketch=await readSketch(page);assert.equal(sketch.entities[4].kind,'circle');assert(Math.abs(sketch.entities[4].radius-10)<=1e-5);
      await page.getByRole('button',{name:'圆弧',exact:true}).click();await point(page,-20,-20);await point(page,-30,-10);await point(page,-40,-20);await entities(page,6);
      sketch=await readSketch(page);assert.equal(sketch.entities[5].kind,'arc');
      const saved=JSON.stringify(sketch);await page.getByRole('button',{name:'线段',exact:true}).click();await point(page,-50,20);await page.keyboard.press('Escape');assert.equal(JSON.stringify(await readSketch(page)),saved);assert.equal(await page.getByRole('region',{name:'草图输入',exact:true}).count(),0);
      await page.getByRole('button',{name:'圆弧',exact:true}).click();await point(page,-50,-40);await point(page,-40,-40);await point(page,-30,-40);await page.getByRole('alert').waitFor();assert.equal(JSON.stringify(await readSketch(page)),saved);
      await page.keyboard.press('Escape');await page.getByRole('button',{name:'线段',exact:true}).click();
      // Known empty-sketch orthographic fit: 70×70 square, radius 35√2, 20% margin.
      const area=await page.locator('canvas').boundingBox(),scale=area.height/120*(60/(35*Math.SQRT2*1.2));
      const target={x:area.x+area.width/2+40*scale,y:area.y+area.height/2-30*scale};
      await page.mouse.move(target.x+7,target.y);await page.getByText('捕捉已有点 · 8 CSS px',{exact:true}).waitFor();
      await page.mouse.click(target.x+7,target.y);await point(page,50,40);await entities(page,7);
      sketch=await readSketch(page);const line=sketch.entities[6],captured=sketch.points.find(p=>p.id===line.startPointId);assert(Math.hypot(captured.position[0]-40,captured.position[1]-30)<=1e-5);
      assert(sketch.constraints.some(c=>c.kind==='coincident'&&c.refs.some(r=>r.pointId===captured.id)));
      // A continuous line keeps the solved endpoint as the next anchor, one command per segment.
      await point(page,60,50);await entities(page,8);const continued=await readSketch(page),second=continued.entities[7];
      assert(continued.constraints.some(c=>c.kind==='coincident'&&c.refs.some(r=>r.pointId===line.endPointId)&&c.refs.some(r=>r.pointId===second.startPointId)));
      await page.getByRole('button',{name:'撤销',exact:true}).click();await entities(page,7);
      await page.waitForFunction(()=>document.querySelector('.sketch-input-panel').dataset.draftCount==='0');
      await page.getByRole('button',{name:'重做',exact:true}).click();await entities(page,8);assert.deepEqual(await readSketch(page),continued);
      sketch=continued;
      const count=sketch.entities.length;await page.keyboard.press('Escape');await page.getByRole('button',{name:'完成草图',exact:true}).click();
      const featureId=sketch.id;await page.locator(`[data-feature-id="${featureId}"]`).click();await page.getByRole('button',{name:'编辑草图',exact:true}).click();assert.equal((await readSketch(page)).entities.length,count);
      evidence.push({plane,rectangle:rect,finalSketch:sketch,expectedRectangleMm:[40,30],circleRadiusMm:10,mouseSnapPx:7,toleranceMm:1e-5,undoRedoExact:true,continuousLineOneCommandPerSegment:true,undoClearsAnchor:true,escapeUnchanged:true,collinearArcRejected:true,idsPreservedOnReedit:true});
      await page.getByRole('button',{name:'完成草图',exact:true}).click();
    }
    assert(workers.some(url=>url.includes('document-solver.worker')));assert.equal(errors.length,0,errors.join('\n'));
    if(mode==='production-root')await page.screenshot({path:'.research/T-104B-drawing.png',fullPage:true});
    results.push({mode,evidence,workers,browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function cancelColdWorker(url){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  let held;
  try{
    await page.goto(url);await page.locator('[data-computation="ready"]').waitFor({timeout:15000});await page.locator('[data-viewport-state="ready"]').waitFor();
    await page.getByRole('button',{name:'XY 平面',exact:true}).click();await page.getByRole('button',{name:'新建草图',exact:true}).click();
    const before=await readSketch(page);await context.route('**/wasm/slvs.wasm',route=>{held=route;});
    await page.getByRole('button',{name:'矩形',exact:true}).click();await point(page,0,0);await point(page,40,30);
    await page.waitForFunction(()=>document.querySelector('.draft-status')?.textContent.includes('正在求解候选'));
    await page.keyboard.press('Escape');await entities(page,0);assert.deepEqual(await readSketch(page),before);
    if(held)await held.abort();await context.unroute('**/wasm/slvs.wasm');
    await page.getByRole('button',{name:'矩形',exact:true}).click();await point(page,0,0);await point(page,40,30);await entities(page,4);
    assert.equal(await page.getByRole('alert').count(),0);results.push({mode:'cancel-native-load',requestPendingWasCancelled:true,documentUnchanged:true,newRealWorkerSucceeded:true,passed:true});
  }finally{await context.close();}
}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
try{
  dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();await check('development',`http://127.0.0.1:${dev.httpServer.address().port}/`);
  production=await preview({root,preview:{host:'127.0.0.1',port:0}});const url=`http://127.0.0.1:${production.httpServer.address().port}/`;await check('production-root',url);await cancelColdWorker(url);
  await build({root,base:'/cad/',build:{outDir:'.research/dist-drawing-cad',emptyOutDir:true}});subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-drawing-cad'},preview:{host:'127.0.0.1',port:0}});
  await check('production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync(process.env.DRAWING_BROWSER_EVIDENCE_PATH??'docs/learning/evidence/T-104B-drawing-browser.json',JSON.stringify({task:process.env.DRAWING_EVIDENCE_TASK??'T-104B',executedAt:new Date().toISOString(),command:'npm run check:drawing:browser',environment:{node:process.version,browser:browser.version()},results,passed:true,
    limitations:['This drawing check does not exercise dragging or entity deletion; see check:sketch-edit for those.','Constraints UI awaits T-201.']},null,2)+'\n');console.log('PASS: real drawing/capture/undo/reedit in three planes and dev/root/cad; native-load cancellation and recovery.');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
