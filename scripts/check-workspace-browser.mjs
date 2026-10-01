import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER_CHANNEL||'msedge',headless:true});
let dev,production,subpath;
const results=[];
async function check(mode,url){
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[],assets=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  context.on('response',r=>{if(r.url().endsWith('/slvs.wasm'))assets.push({url:r.url(),status:r.status(),mime:r.headers()['content-type']});});
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('[aria-label="CAD 工作区"][data-computation="ready"]').waitFor({timeout:15000});
    assert.equal(await page.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'矩形',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'选择',exact:true}).isEnabled(),true);
    assert.equal(await page.getByText('暂无特征',{exact:true}).count(),1);
    assert(assets.some(a=>a.status===200 && /application\/wasm/.test(a.mime)),'startup must load actual WASM');
    const before=await page.getByRole('region',{name:'建模视口'}).boundingBox();
    await page.getByRole('button',{name:'折叠特征树',exact:true}).click();
    await page.getByRole('button',{name:'折叠属性',exact:true}).click();
    const after=await page.getByRole('region',{name:'建模视口'}).boundingBox();
    assert(after.width>before.width);assert.equal(await page.getByRole('button',{name:'展开特征树',exact:true}).getAttribute('aria-expanded'),'false');
    await page.setViewportSize({width:1024,height:720});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.getByRole('button',{name:'展开特征树',exact:true}).click();
    await page.getByRole('button',{name:'展开属性',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    assert(await page.getByText('当前为窄屏布局，完整建模面向桌面宽屏。',{exact:true}).isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.setViewportSize({width:1280,height:720});
    await page.getByRole('button',{name:'技术实验',exact:true}).click();
    assert.equal(await page.locator('[aria-label="CAD 工作区"]').count(),0);
    await page.getByRole('button',{name:'工作区',exact:true}).click();
    await page.locator('[aria-label="CAD 工作区"][data-computation="ready"]').waitFor({timeout:15000});
    assert.equal(await page.getByRole('button',{name:'选择',exact:true}).isEnabled(),true);
    assert.equal(errors.length,0,errors.join('\n'));
    if(mode==='production-root')await page.screenshot({path:'.research/T-101-workspace.png',fullPage:true});
    results.push({mode,url,wasmAssets:assets,viewportWidthBeforeCollapse:before.width,viewportWidthAfterCollapse:after.width,
      widthsChecked:[1280,1024,390],unimplementedActionsDisabled:true,viewRemountLoaded:true,browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function failureRetry(url){
  const context=await browser.newContext(),page=await context.newPage();
  try{
    await context.route('**/wasm/slvs.wasm',route=>route.fulfill({status:503,body:'intentional startup failure'}));
    await page.goto(url);await page.locator('[aria-label="CAD 工作区"][data-computation="error"]').waitFor({timeout:15000});
    assert(await page.getByRole('button',{name:'选择',exact:true}).isDisabled());
    assert(await page.getByRole('button',{name:'重试加载',exact:true}).isVisible());
    const failure=await page.getByRole('alert').textContent();
    await context.unroute('**/wasm/slvs.wasm');
    await page.getByRole('button',{name:'重试加载',exact:true}).click();
    await page.locator('[aria-label="CAD 工作区"][data-computation="ready"]').waitFor({timeout:15000});
    assert(await page.getByRole('button',{name:'选择',exact:true}).isEnabled());
    results.push({mode:'startup-503-and-retry',failure,actual:'visible error, selection disabled, explicit retry reached ready',passed:true});
  }finally{await context.close();}
}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
try{
  dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();
  await check('development',`http://127.0.0.1:${dev.httpServer.address().port}/`);
  production=await preview({root,preview:{host:'127.0.0.1',port:0}});const url=`http://127.0.0.1:${production.httpServer.address().port}/`;
  await check('production-root',url);await failureRetry(url);
  await build({root,base:'/cad/',build:{outDir:'.research/dist-cad',emptyOutDir:true}});
  subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-cad'},preview:{host:'127.0.0.1',port:0}});
  await check('production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync(new URL('../docs/learning/evidence/T-101-workspace-browser.json',import.meta.url),JSON.stringify({task:'T-101',executedAt:new Date().toISOString(),
    command:'npm run check:workspace',environment:{node:process.version,browser:browser.version(),pinia:'4.0.3'},results,passed:true,
    limitations:['Workspace shell only; Three.js viewport and editable domain document are not yet implemented.']},null,2)+'\n');
  console.log('PASS: workspace real startup, layouts, disabled actions, view remount and 503 retry across dev/root/cad.');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
