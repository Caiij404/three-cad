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
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    const workspace=page.locator('[aria-label="CAD 工作区"]');
    await page.locator('[aria-label="CAD 工作区"][data-computation="ready"]').waitFor({timeout:15000});
    const id=await workspace.getAttribute('data-project-id');assert(id);
    const rename=async name=>{await page.getByLabel('项目名称',{exact:true}).fill(name);await page.getByRole('button',{name:'应用名称',exact:true}).click();await page.getByRole('heading',{level:1,name,exact:true}).waitFor();};
    await rename('学习零件 A');assert.equal(await workspace.getAttribute('data-project-id'),id);
    assert(await page.getByText('单位 mm · Z 向上 · 未保存的修改',{exact:true}).isVisible());
    await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('heading',{name:'未命名项目',level:1,exact:true}).waitFor();
    await page.getByRole('button',{name:'重做',exact:true}).click();await page.getByRole('heading',{name:'学习零件 A',level:1,exact:true}).waitFor();
    await page.getByRole('button',{name:'撤销',exact:true}).click();await rename('学习零件 B');assert(await page.getByRole('button',{name:'重做',exact:true}).isDisabled());
    await page.getByRole('button',{name:'选择',exact:true}).click();await page.keyboard.press('Control+z');await page.getByRole('heading',{name:'未命名项目',level:1,exact:true}).waitFor();
    await page.keyboard.press('Control+Shift+z');await page.getByRole('heading',{name:'学习零件 B',level:1,exact:true}).waitFor();
    await page.getByLabel('项目名称',{exact:true}).focus();await page.keyboard.press('Control+z');assert(await page.getByRole('heading',{name:'学习零件 B',level:1,exact:true}).isVisible());
    const literal='<img src=x onerror="window.__injected=1">';await rename(literal);assert.equal(await page.locator('h1 img').count(),0);assert.equal(await page.evaluate(()=>window.__injected),undefined);
    await page.getByLabel('项目名称',{exact:true}).fill('   ');await page.getByRole('button',{name:'应用名称',exact:true}).click();await page.getByRole('alert').waitFor();
    assert(await page.getByRole('heading',{level:1,name:literal,exact:true}).isVisible());assert.equal(await workspace.getAttribute('data-project-id'),id);
    await rename('学习零件 B');
    await page.getByRole('button',{name:'技术实验',exact:true}).click();await page.getByRole('button',{name:'工作区',exact:true}).click();
    await page.locator('[aria-label="CAD 工作区"][data-computation="ready"]').waitFor({timeout:15000});assert(await page.getByRole('heading',{name:'学习零件 B',level:1,exact:true}).isVisible());assert.equal(await workspace.getAttribute('data-project-id'),id);
    await page.getByRole('button',{name:'新建',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert(await dialog.getByRole('button',{name:'保存后新建',exact:true}).isDisabled());await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await workspace.getAttribute('data-project-id'),id);
    await page.getByRole('button',{name:'新建',exact:true}).click();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await workspace.getAttribute('data-project-id'),id);
    await page.getByRole('button',{name:'新建',exact:true}).click();await dialog.getByRole('button',{name:'丢弃修改并新建',exact:true}).click();
    await page.getByRole('heading',{name:'未命名项目',level:1,exact:true}).waitFor();const newId=await workspace.getAttribute('data-project-id');assert.notEqual(newId,id);
    assert(await page.getByRole('button',{name:'撤销',exact:true}).isDisabled());assert(await page.getByRole('button',{name:'重做',exact:true}).isDisabled());
    assert(await page.getByRole('button',{name:'保存',exact:true}).isDisabled());assert.equal(errors.length,0,errors.join('\n'));
    if(mode==='production-root')await page.screenshot({path:'.research/T-102-project.png',fullPage:true});
    results.push({mode,url,projectIdBefore:id,projectIdAfter:newId,checks:['name command','undo/redo','redo branch cleared','keyboard focus boundary','literal HTML escaped','invalid name rollback','view remount retains project','new cancel/Esc/discard clears history'],browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
try{
  dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();await check('development',`http://127.0.0.1:${dev.httpServer.address().port}/`);
  production=await preview({root,preview:{host:'127.0.0.1',port:0}});await check('production-root',`http://127.0.0.1:${production.httpServer.address().port}/`);
  await build({root,base:'/cad/',build:{outDir:'.research/dist-cad',emptyOutDir:true}});
  subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-cad'},preview:{host:'127.0.0.1',port:0}});await check('production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync(new URL('../docs/learning/evidence/T-102-project-browser.json',import.meta.url),JSON.stringify({task:'T-102',executedAt:new Date().toISOString(),command:'npm run check:project',
    environment:{node:process.version,browser:browser.version()},results,passed:true,limitations:['Metadata commands only; complete sketch/history/file workflows remain future tasks.']},null,2)+'\n');
  console.log('PASS: real document rename/new/undo/redo, dirty guard, safe names and focus in dev/root/cad.');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
