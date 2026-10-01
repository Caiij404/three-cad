import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),results=[];
const browser=await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER_CHANNEL||'msedge',headless:true});
let dev,production,subpath;
async function check(mode,url,prefix){
  const context=await browser.newContext(),page=await context.newPage(),errors=[],assets=[],workers=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('worker',w=>workers.push(w.url()));
  context.on('response',r=>{const path=new URL(r.url()).pathname;if(path.endsWith('/slvs.wasm')||path.endsWith('/slvs.mjs'))assets.push({path,status:r.status(),mime:r.headers()['content-type']});if(r.status()>=400)errors.push(`${r.status()} ${path}`);});
  try{
    await page.goto(`${url}?view=experiments`);await page.getByRole('button',{name:'运行领域草图求解',exact:true}).click();
    await page.locator('[data-testid="domain-solver-evidence"]').waitFor({state:'attached',timeout:25000});
    const cases=JSON.parse(await page.locator('[data-testid="domain-solver-evidence"]').textContent());assert.equal(cases.length,12);
    const transaction=JSON.parse(await page.locator('[data-testid="domain-transaction-evidence"]').textContent());assert(transaction.passed);assert(transaction.conflictDocumentHistoryUnchanged);
    assert.equal(cases.find(c=>c.id==='free-circle').result.dof,3);assert.equal(cases.find(c=>c.id==='conflict').result.sketch,null);
    assert.equal(workers.length,1);assert(workers[0].includes(mode==='development'?'document-solver.worker.ts':'document-solver.worker-'));
    const wasm=assets.find(a=>a.path===`${prefix}wasm/slvs.wasm`);assert.equal(wasm?.status,200);assert.match(wasm.mime,/application\/wasm/);assert.equal(errors.length,0,errors.join('\n'));
    results.push({mode,assets,workers,cases,transaction,browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function failureRetry(url){
  const context=await browser.newContext(),page=await context.newPage();
  try{
    await context.route('**/wasm/slvs.wasm',route=>route.fulfill({status:503,body:'intentional domain solver failure'}));
    await page.goto(`${url}?view=experiments`);await page.getByRole('button',{name:'运行领域草图求解',exact:true}).click();await page.getByRole('alert').waitFor();
    const failure=await page.getByRole('alert').textContent();await context.unroute('**/wasm/slvs.wasm');await page.getByRole('button',{name:'运行领域草图求解',exact:true}).click();await page.locator('[data-testid="domain-solver-evidence"]').waitFor({state:'attached',timeout:25000});
    assert.equal(JSON.parse(await page.locator('[data-testid="domain-solver-evidence"]').textContent()).length,12);results.push({mode:'503-and-explicit-retry',failure,actual:'12 real cases after retry',passed:true});
  }finally{await context.close();}
}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
try{
  dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();await check('development',`http://127.0.0.1:${dev.httpServer.address().port}/`,'/');
  production=await preview({root,preview:{host:'127.0.0.1',port:0}});const url=`http://127.0.0.1:${production.httpServer.address().port}/`;await check('production-root',url,'/');await failureRetry(url);
  await build({root,base:'/cad/',build:{outDir:'.research/dist-domain-cad',emptyOutDir:true}});subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-domain-cad'},preview:{host:'127.0.0.1',port:0}});
  await check('production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`,'/cad/');
  writeFileSync(process.env.DOMAIN_SOLVER_BROWSER_EVIDENCE_PATH??'docs/learning/evidence/T-104A-domain-browser.json',JSON.stringify({task:process.env.DOMAIN_SOLVER_EVIDENCE_TASK??'T-104A',executedAt:new Date().toISOString(),command:'npm run check:domain-solver:browser',environment:{node:process.version,browser:browser.version()},results,passed:true,
    limitations:['Domain adapter/Worker experiment only; UI drawing/snap/gesture queue not yet implemented.']},null,2)+'\n');console.log('PASS: actual domain solver Worker, 12 cases, MIME, dev/root/cad and 503 retry.');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
