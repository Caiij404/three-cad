import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {build,createServer,preview} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),results=[];
const browser=await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER_CHANNEL||'msedge',headless:true});let dev,production,subpath;
async function sketch(page){return JSON.parse(await page.locator('[data-testid="active-sketch-data"]').textContent());}
async function point(page,x,y){await page.getByLabel('下一点 X (mm)',{exact:true}).fill(String(x));await page.getByLabel('下一点 Y (mm)',{exact:true}).fill(String(y));await page.getByRole('button',{name:'输入此点',exact:true}).click();}
async function count(page,n){await page.waitForFunction(n=>JSON.parse(document.querySelector('[data-testid="active-sketch-data"]').textContent).entities.length===n,n);}
async function ready(page,url){await page.goto(url);await page.locator('[data-computation="ready"]').waitFor({timeout:15000});await page.locator('[data-viewport-state="ready"]').waitFor();}
async function revision(page){return Number((await page.locator('.workspace-status').textContent()).match(/revision (\d+)/)[1]);}
function dimensions(s){const xs=s.points.map(p=>p.position[0]),ys=s.points.map(p=>p.position[1]);return [Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];}
async function project(page,p,s=null){const box=await page.locator('canvas').boundingBox();let minX=-35,maxX=35,minY=-35,maxY=35;
  if(s)for(const {position:[x,y]} of s.points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const radius=Math.hypot(maxX-minX,maxY-minY)/2,scale=box.height/120*(60/(radius*1.2));
  return {x:box.x+box.width/2+(p[0]-(minX+maxX)/2)*scale,y:box.y+box.height/2-(p[1]-(minY+maxY)/2)*scale,scale};
}
async function drag(page,from,to){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:30});}
async function monitor(context){await context.addInitScript(()=>{
  window.__dragRequests=[];window.__dragMaxInflight=0;const pending=new Map(),NativeWorker=Worker,post=Worker.prototype.postMessage,terminate=Worker.prototype.terminate;
  // Register the observer before WorkerRpc's onmessage; microtasks may run between event listeners.
  window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>pending.delete(event.data?.sessionId+':'+event.data?.requestId));}};
  Worker.prototype.postMessage=function(data,...rest){
    if(data?.input?.draggedPointId){const key=data.sessionId+':'+data.requestId;pending.set(key,this);const at=data.input.sketch.points.find(p=>p.id===data.input.draggedPointId)?.position;window.__dragRequests.push({sessionId:data.sessionId,requestId:data.requestId,revision:data.revision,sketchId:data.input.sketch.id,draggedPointId:data.input.draggedPointId,targetMm:at});window.__dragMaxInflight=Math.max(window.__dragMaxInflight,[...pending.values()].filter(w=>w===this).length);}
    return post.call(this,data,...rest);
  };
  Worker.prototype.terminate=function(){for(const [key,worker] of pending)if(worker===this)pending.delete(key);return terminate.call(this);};
});}
async function check(mode,url){
  const context=await browser.newContext({viewport:{width:1280,height:900}});await monitor(context);const page=await context.newPage(),errors=[],planes=[];page.on('pageerror',e=>errors.push(e.message));
  try{await ready(page,url);
    for(const plane of ['XY','XZ','YZ']){
      const area=await page.locator('canvas').boundingBox(),mx=area.x+area.width*.6,my=area.y+area.height*.5;
      await page.mouse.move(mx,my);await page.mouse.down({button:'right'});await page.mouse.move(mx+40,my+20,{steps:4});await page.mouse.up({button:'right'});await page.mouse.wheel(0,-100);
      await page.getByRole('button',{name:`${plane} 平面`,exact:true}).click();await page.getByRole('button',{name:'新建草图',exact:true}).click();
      await page.getByRole('button',{name:'矩形',exact:true}).click();await point(page,0,0);await point(page,40,30);await count(page,4);await page.keyboard.press('Escape');
      const before=await sketch(page),rev=await revision(page),from=await project(page,[40,30]),to=await project(page,[50,35]);
      await drag(page,from,to);await page.getByText('拖动预览 · 未提交 · 松开提交，Esc 取消',{exact:true}).waitFor();assert.deepEqual(await sketch(page),before);assert.equal(await revision(page),rev);
      if(mode==='production-root'&&plane==='XY')await page.screenshot({path:'.research/T-104C-drag-preview.png',fullPage:true});
      await page.mouse.up();await page.waitForFunction(rev=>Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1])===rev+1,rev);
      const moved=await sketch(page);dimensions(moved).forEach((value,i)=>assert(Math.abs(value-[50,35][i])<=1e-5));assert.deepEqual(moved.entities,before.entities);assert.deepEqual(moved.constraints,before.constraints);
      await page.mouse.click(to.x,to.y);const displayed=await page.locator('[data-point-id]').textContent(),selectedId=await page.locator('[data-point-id]').getAttribute('data-point-id'),shownPoint=moved.points.find(p=>p.id===selectedId);assert(shownPoint);assert(Math.hypot(shownPoint.position[0]-50,shownPoint.position[1]-35)<=1e-5);assert(displayed.includes(`X ${shownPoint.position[0].toFixed(6)} mm`)&&displayed.includes(`Y ${shownPoint.position[1].toFixed(6)} mm`));
      await page.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(await sketch(page),before);await page.getByRole('button',{name:'重做',exact:true}).click();assert.deepEqual(await sketch(page),moved);
      // Esc during a solved preview keeps authoritative data and the history revision unchanged.
      const savedRevision=await revision(page);await drag(page,to,{x:to.x+5*to.scale,y:to.y-5*to.scale});await page.getByText('拖动预览 · 未提交 · 松开提交，Esc 取消',{exact:true}).waitFor();await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await sketch(page),moved);assert.equal(await revision(page),savedRevision);
      // Finish cancels an unfinished gesture, and the next edit restores all IDs.
      await drag(page,to,{x:to.x+4*to.scale,y:to.y-3*to.scale});await page.getByText('拖动预览 · 未提交 · 松开提交，Esc 取消',{exact:true}).waitFor();await page.getByRole('button',{name:'完成草图',exact:true}).focus();await page.keyboard.press('Enter');await page.mouse.up();
      await page.locator(`[data-feature-id="${moved.id}"]`).click();await page.getByRole('button',{name:'编辑草图',exact:true}).click();assert.deepEqual(await sketch(page),moved);
      // In the newly fitted plane, wheel zoom still uses CSS pixels for capture.
      const zoomed=await project(page,[50,35],moved),center=await project(page,[7.5,0],moved);await page.mouse.move(center.x,center.y);await page.mouse.wheel(0,-100);await page.waitForTimeout(150);
      const target={x:center.x+(zoomed.x-center.x)/.95,y:center.y+(zoomed.y-center.y)/.95};
      await page.getByRole('button',{name:'线段',exact:true}).click();await page.mouse.move(target.x+9,target.y);assert.equal(await page.locator('.snap-hint').count(),0);await page.mouse.move(target.x+7,target.y);await page.getByText('捕捉已有点 · 8 CSS px',{exact:true}).waitFor();await page.mouse.click(target.x+7,target.y);await point(page,60,45);await count(page,5);await page.keyboard.press('Escape');
      const captured=await sketch(page),line=captured.entities[4],start=captured.points.find(p=>p.id===line.startPointId);assert(Math.hypot(start.position[0]-50,start.position[1]-35)<=1e-5);assert(captured.constraints.some(c=>c.kind==='coincident'&&c.refs.some(r=>r.pointId===start.id)));
      // Invalid inputs reject without changing the committed sketch.
      for(const [tool,inputs] of [['线段',[[-20,-20],[-20,-20]]],['矩形',[[-50,-40],[-50,-20]]],['圆',[[90,-20],[90,-20]]],['圆弧',[[100,-30],[100,-30],[110,-20]]],['圆弧',[[-50,-40],[-40,-40],[-30,-40]]]]){
        await page.getByRole('button',{name:tool,exact:true}).click();for(const p of inputs)await point(page,...p);await page.getByRole('alert').waitFor();assert.deepEqual(await sketch(page),captured);await page.keyboard.press('Escape');
      }
      await page.getByText('草图对象',{exact:true}).click();await page.locator(`[data-entity-id="${line.id}"]`).click();
      const lengthText=await page.locator(`[data-entity-measurement-id="${line.id}"]`).textContent();assert(Math.abs(Number(lengthText.match(/线长 ([\d.]+) mm/)[1])-Math.SQRT2*10)<=1e-5);
      await page.getByLabel('项目名称',{exact:true}).focus();await page.keyboard.press('Delete');await page.keyboard.press('Control+z');assert.deepEqual(await sketch(page),captured);
      await page.locator('canvas').focus();await page.keyboard.press('Delete');await count(page,4);const deleted=await sketch(page);assert.equal(deleted.points.length,captured.points.length-2);assert(!deleted.constraints.some(c=>c.refs.some(r=>'entityId' in r?r.entityId===line.id:[line.startPointId,line.endPointId].includes(r.pointId))));
      await page.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(await sketch(page),captured);await page.getByRole('button',{name:'重做',exact:true}).click();assert.deepEqual(await sketch(page),deleted);
      await page.locator(`[data-entity-id="${deleted.entities[0].id}"]`).click();await page.keyboard.down('Control');await page.locator(`[data-entity-id="${deleted.entities[1].id}"]`).click();await page.keyboard.up('Control');await page.getByRole('button',{name:'删除选中实体',exact:true}).click();await count(page,2);
      const multi=await sketch(page);assert.equal(multi.points.length,4);await page.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(await sketch(page),deleted);
      planes.push({plane,before,moved,expectedDimensionsMm:[50,35],toleranceMm:1e-5,previewDocumentUnchanged:true,displayAndPickingMatchDomain:true,oneGestureOneRevision:true,undoRedoExact:true,escapeAndExitUnchanged:true,rotatedModelThenEdit:true,zoomCapture:{insideCssPx:7,outsideCssPx:9,explicitCoincident:true},invalidInputs:5,textFocusProtected:true,deleted,multiDelete:multi,passed:true});
      await page.getByRole('button',{name:'完成草图',exact:true}).click();
    }
    assert.equal(errors.length,0,errors.join('\n'));const requests=await page.evaluate(()=>({requests:window.__dragRequests,maxNativeRequestsInflight:window.__dragMaxInflight}));assert.equal(requests.maxNativeRequestsInflight,1);
    results.push({mode,planes,...requests,browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function cancelCold(url,action){const context=await browser.newContext({viewport:{width:1280,height:900}});await monitor(context);const page=await context.newPage();let held,releaseCaptured;const captured=new Promise(resolve=>releaseCaptured=resolve);
  try{await ready(page,url);await page.getByRole('button',{name:'XY 平面',exact:true}).click();await page.getByRole('button',{name:'新建草图',exact:true}).click();await page.getByRole('button',{name:'矩形',exact:true}).click();await point(page,0,0);await point(page,40,30);await count(page,4);await page.keyboard.press('Escape');
    const before=await sketch(page),rev=await revision(page);await context.route('**/wasm/slvs.wasm',route=>{held=route;releaseCaptured();});
    await drag(page,await project(page,[40,30]),await project(page,[50,35]));await Promise.race([captured,new Promise((_,reject)=>setTimeout(()=>reject(Error('No cold native request')),5000))]);
    assert.equal(await page.evaluate(()=>window.__dragRequests.length),1);assert.deepEqual(await sketch(page),before);
    if(action==='escape')await page.keyboard.press('Escape');
    if(action==='exit'){await page.getByRole('button',{name:'完成草图',exact:true}).focus();await page.keyboard.press('Enter');}
    if(action==='new'){await page.getByRole('button',{name:'新建',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'丢弃修改并新建',exact:true}).focus();await page.keyboard.press('Enter');}
    await page.mouse.up();await held.abort();await context.unroute('**/wasm/slvs.wasm');
    if(action==='escape'){
      assert.deepEqual(await sketch(page),before);assert.equal(await revision(page),rev);await drag(page,await project(page,[40,30]),await project(page,[50,35]));await page.mouse.up();await page.waitForFunction(rev=>Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1])===rev+1,rev);assert(Math.abs(dimensions(await sketch(page))[0]-50)<=1e-5);
    }else if(action==='exit'){await page.locator(`[data-feature-id="${before.id}"]`).click();await page.getByRole('button',{name:'编辑草图',exact:true}).click();assert.deepEqual(await sketch(page),before);}
    else{assert.equal(await page.locator('[data-feature-id]').count(),0);assert.equal(await page.locator('[data-testid="active-sketch-data"]').count(),0);}
    results.push({mode:`cancel-cold-${action}`,oneInflightDuringHeldNativeLoad:true,oldDataOrNewProjectPreserved:true,newWorkerRecovery:action==='escape',passed:true});
  }finally{await context.close();}
}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
try{dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();await check('development',`http://127.0.0.1:${dev.httpServer.address().port}/`);
  production=await preview({root,preview:{host:'127.0.0.1',port:0}});const url=`http://127.0.0.1:${production.httpServer.address().port}/`;await check('production-root',url);for(const action of ['escape','exit','new'])await cancelCold(url,action);
  await build({root,base:'/cad/',build:{outDir:'.research/dist-edit-cad',emptyOutDir:true}});subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-edit-cad'},preview:{host:'127.0.0.1',port:0}});await check('production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync(process.env.SKETCH_EDIT_BROWSER_EVIDENCE_PATH??'docs/learning/evidence/T-104C-edit-browser.json',JSON.stringify({task:process.env.SKETCH_EDIT_EVIDENCE_TASK??'T-104C',executedAt:new Date().toISOString(),command:'npm run check:sketch-edit:browser',environment:{node:process.version,browser:browser.version()},results,passed:true,limitations:['Generic solid descendants and final acceptance await later tasks.','Only Edge measured; three-browser/performance acceptance remains pending.']},null,2)+'\n');console.log('PASS: actual three-plane drag/preview/history/delete/focus/zoom capture in dev/root/cad; cold native cancellation on Escape/exit/new.');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
