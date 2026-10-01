import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge',headless:true});
let dev,production,subpath;
const results=[];
async function check(mode,url) {
  const context=await browser.newContext(),page=await context.newPage(),errors=[],workers=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('worker',w=>workers.push(w.url()));
  context.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
  try {
    await page.goto(`${url}?view=experiments`,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'运行真实几何实验',exact:true}).click();
    const output=page.locator('[data-testid="solid-evidence"]');
    await output.waitFor({state:'attached',timeout:25000});
    const cases=JSON.parse(await output.textContent());
    assert.equal(cases.length,19);assert(cases.every(c=>c.passed));
    assert.equal(workers.filter(url=>url.includes('solid.worker')).length,1);
    assert.equal(errors.length,0,errors.join('\n'));
    results.push({mode,url,workerUrls:workers,cases,browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
try {
  dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();
  await check('development',`http://127.0.0.1:${dev.httpServer.address().port}/`);
  production=await preview({root,preview:{host:'127.0.0.1',port:0}});
  await check('production-root',`http://127.0.0.1:${production.httpServer.address().port}/`);
  await build({root,base:'/cad/',build:{outDir:'.research/dist-cad',emptyOutDir:true}});
  subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-cad'},preview:{host:'127.0.0.1',port:0}});
  await check('production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync(new URL('../docs/learning/evidence/T-004-solid-browser.json',import.meta.url),JSON.stringify({
    task:'T-004',executedAt:new Date().toISOString(),command:'npm run check:solid:browser',
    environment:{node:process.version,browserVersion:browser.version(),three:'0.186.1'},results,passed:true,
    limitations:['Fixed technical fixtures; no complete editable CAD workflow or renderer yet.'],
  },null,2)+'\n');
  console.log('PASS: 19 real solid Worker numerical cases in dev, production, /cad/.');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
