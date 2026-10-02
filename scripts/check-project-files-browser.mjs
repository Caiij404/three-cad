import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url)); mkdirSync('.research', { recursive: true });
// Compile the production service and Workers in an isolated probe; this is not the file UI.
writeFileSync('.research/project-files-probe.html', '<!doctype html><meta charset="utf-8"><pre id="result">running</pre><script type="module" src="./project-files-probe.ts"></script>');
writeFileSync('.research/project-files-probe.ts', String.raw`
import { ProjectSession } from '../src/app/project-session.ts';
import { booleanBoxSketch } from '../src/experiments/mesh-boolean-fixtures.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
import { serializeProject } from '../src/core/model/validate-document.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
const session = new ProjectSession(), publications:any[] = [];
const unsubscribe = session.subscribe(snapshot => publications.push(snapshot));
const check = (value:boolean, message:string) => { if (!value) throw new Error(message); };
const equal = (a:unknown, b:unknown, message:string) => check(JSON.stringify(a) === JSON.stringify(b), message);
const state = () => ({ ...session.snapshot(), cache:session.derivedCache });
const volumetric = (id:string, expected:number) => { const actual = meshMetrics(session.derivedCache[id]); check(actual.closed && Math.abs(actual.signedVolume - expected) <= 1e-6, id+' volume'); return actual.signedVolume; };
async function run() {
  for (const [id,x] of [['a',0],['b',10]] as const) {
    await session.execute({kind:'add-feature',feature:booleanBoxSketch(id,'XY',x)});
    const s = session.snapshot().document.features.find(f=>f.id===id)!;
    if (s.kind!=='sketch') throw new Error('sketch');
    await session.execute({kind:'add-feature',feature:{id:'solid-'+id,kind:'extrude',name:id,visible:true,sketchId:id,region:selectSketchRegion(buildSketchRegions(s)).definition,depth:20}});
  }
  await session.execute({kind:'add-feature',feature:{id:'join',kind:'boolean',name:'交集',visible:true,operation:'intersect',operandAId:'solid-a',operandBId:'solid-b'}});
  const saved = session.captureSave(), file = serializeProject(saved.document); check(session.markSaved(saved),'save token'); check(!session.snapshot().dirty,'saved dirty');
  await session.execute({kind:'rename-project',name:'redo'}); session.undo(); const before = state();
  let invalidCode=''; try { await session.openJson('{'); } catch(e) { invalidCode=(e as any).code; } check(invalidCode==='INVALID_JSON','decode failure'); equal(state(),before,'decode must not publish');
  const start=publications.length; await session.openJson(file); const loaded=state();
  check(loaded.projectSessionId!==before.projectSessionId,'new session'); check(!loaded.dirty&&!loaded.canUndo&&!loaded.canRedo&&!loaded.busy,'new empty history');
  equal(loaded.document,saved.document,'rebuilt doc'); equal(loaded.cache,before.cache,'rebuilt cache'); equal(loaded.diagnostics,before.diagnostics,'rebuilt diagnostics');
  const opening = publications.slice(start); check(opening.length===2&&opening[0].busy&&!opening[1].busy,'loading lifecycle'); equal(opening[0].document,before.document,'old document while computing');
  check(!session.markSaved(saved),'old save acknowledgement');
  const solid=loaded.document.features.find(f=>f.id==='solid-a')!; if(solid.kind!=='extrude')throw new Error('solid');
  await session.execute({kind:'replace-feature',feature:{...solid,depth:30}}); const edited={a:volumetric('solid-a',12000),intersection:volumetric('join',4000)}; session.undo(); equal(state().document,loaded.document,'edit undo'); equal(state().cache,loaded.cache,'mesh undo'); check(!session.snapshot().dirty,'undo clean'); session.redo();
  const beforeFailure=state(), malformed=structuredClone(loaded.document); malformed.features.find(f=>f.id==='a')!.kind==='sketch' && ((malformed.features.find(f=>f.id==='a')! as any).plane.origin[2]=20);
  malformed.features.push({id:'late',kind:'boolean',name:'晚失败',visible:true,operation:'union',operandAId:'join',operandBId:'solid-b'});
  let failureCode=''; try { await session.openJson(serializeProject(malformed)); } catch(e) { failureCode=(e as any).code; } check(failureCode==='BOOLEAN_EMPTY_OPERAND','late failure code'); equal(state(),beforeFailure,'failed opening authority');
  await session.openJson(file); volumetric('join',4000);
  return {savedFileBytes:new TextEncoder().encode(file).byteLength,oldSaveTokenRejected:true,invalidCode,exactDocumentCacheDiagnosticsRebuilt:true,loadingPublications:opening.map(s=>({busy:s.busy,revision:s.revision,projectSessionId:s.projectSessionId})),edited,failureCode,failedOpenAuthorityExact:true,recoveryPassed:true,passed:true};
}
run().then(result=>document.getElementById('result')!.textContent=JSON.stringify(result)).catch(error=>document.getElementById('result')!.textContent=JSON.stringify({passed:false,error:String(error),stack:error.stack})).finally(()=>{unsubscribe();session.dispose();});
`);
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true }), results = []; let dev, rootPreview, cadPreview;
async function check(mode, url) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  try { await page.goto(url); await page.waitForFunction(() => document.getElementById('result').textContent !== 'running', undefined, { timeout: 20000 }); const result = JSON.parse(await page.locator('#result').textContent()); assert(result.passed, JSON.stringify(result)); assert.deepEqual(errors, []); results.push({ mode, ...result, browserErrors: errors }); console.log(`PASS ${mode}: ProjectSession actual Worker JSON rebuild/failure/continued edit`); } finally { await page.close(); }
}
async function compile(base, outDir) { await build({ root, base, build: { outDir, emptyOutDir: true, rolldownOptions: { input: '.research/project-files-probe.html' } } }); return preview({ root, base, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } }); }
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development-service', `http://127.0.0.1:${dev.httpServer.address().port}/.research/project-files-probe.html`);
  rootPreview = await compile('/', '.research/dist-project-files-root'); await check('production-root-service', `http://127.0.0.1:${rootPreview.httpServer.address().port}/.research/project-files-probe.html`);
  cadPreview = await compile('/cad/', '.research/dist-project-files-cad'); await check('production-/cad/-service', `http://127.0.0.1:${cadPreview.httpServer.address().port}/cad/.research/project-files-probe.html`);
  writeFileSync('docs/learning/evidence/T-401A-project-files-browser.json', JSON.stringify({ task: 'T-401A', executedAt: new Date().toISOString(), command: 'npm run check:project-files:browser', environment: { node: process.version, platform: process.platform, browser: browser.version() }, results, passed: true, limitations: ['Isolated production ProjectSession/Worker probe, not file chooser/download UI or camera capture.', 'IndexedDB/recovery and full REQ-010/E2E-02 remain T-401B/C.', 'Edge only; final three browsers/performance remain T-403.'] }, null, 2) + '\n');
} finally { if (dev) await dev.close(); await closePreview(rootPreview); await closePreview(cadPreview); await browser.close(); }
