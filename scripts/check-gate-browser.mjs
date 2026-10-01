import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge',headless:true});
let dev,production,subpath;
const results=[];
async function check(mode,url){
  const context=await browser.newContext(),page=await context.newPage(),errors=[],workers=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('worker',worker=>workers.push(worker.url()));
  context.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()}: ${response.url()}`);});
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'运行兼容与恢复实验',exact:true}).click();
    const output=page.locator('[data-testid="gate-evidence"]');
    await output.waitFor({state:'attached',timeout:30000});
    const result=JSON.parse(await output.textContent());
    assert(result.passed && result.concurrent && result.invalidInputRecovered && result.timeout.recovered);
    assert.equal(result.solverCases,8);assert.equal(result.solidCases,19);
    assert.equal(result.timings.solver.samplesMs.length,30);assert.equal(result.timings.solid.samplesMs.length,30);
    assert.equal(result.timeout.workerCreations,2);assert(result.timeout.deadlineMs>=9900);
    assert.equal(workers.length,4,'solver, solid, stalled and recovered solver are actual dedicated Workers');
    assert.equal(errors.length,0,errors.join('\n'));
    results.push({mode,url,workerUrls:workers,result,browserErrors:errors,passed:true});
  }finally{await context.close();}
}
async function closePreview(server){if(!server)return;server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
try{
  dev=await createServer({root,server:{host:'127.0.0.1',port:0}});await dev.listen();
  await check('development',`http://127.0.0.1:${dev.httpServer.address().port}/`);
  console.log('Development real parallel kernels and 10s recovery passed.');
  production=await preview({root,preview:{host:'127.0.0.1',port:0}});
  await check('production-root',`http://127.0.0.1:${production.httpServer.address().port}/`);
  console.log('Production root parallel kernels and 10s recovery passed.');
  await build({root,base:'/cad/',build:{outDir:'.research/dist-cad',emptyOutDir:true}});
  subpath=await preview({root,base:'/cad/',build:{outDir:'.research/dist-cad'},preview:{host:'127.0.0.1',port:0}});
  await check('production-/cad/',`http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync(new URL('../docs/learning/evidence/T-005-gate-browser.json',import.meta.url),JSON.stringify({
    task:'T-005',executedAt:new Date().toISOString(),command:'npm run check:gate',
    environment:{node:process.version,browserChannel:process.env.BOOTSTRAP_BROWSER_CHANNEL||'msedge',browserVersion:browser.version()},
    results,passed:true,limitations:['Transport matching does not implement document transaction revision authority.',
      'Small M0 fixture timings are not NFR-003 model-scale performance acceptance.','Other browsers and OS not tested.'],
  },null,2)+'\n');
  console.log('PASS: M0 real parallel solver/solid, 30 warm samples, actual 10s recovery across dev, production and /cad/.');
}finally{if(dev)await dev.close();await closePreview(production);await closePreview(subpath);await browser.close();}
