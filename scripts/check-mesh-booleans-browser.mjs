import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true }); let dev, production, subpath;
async function check(mode, url) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [], workers = [], wasm = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('worker', w => workers.push(w.url())); context.on('response', r => { if (r.url().endsWith('slvs.wasm')) wasm.push({ status: r.status(), mime: r.headers()['content-type'] }); });
  try {
    await page.goto(`${url}?view=experiments`); await page.getByRole('button', { name: '运行真实网格布尔实验', exact: true }).click(); const output = page.locator('[data-testid="mesh-boolean-evidence"]'); await output.waitFor({ state: 'attached', timeout: 25000 });
    const evidence = JSON.parse(await output.textContent()); assert.equal(evidence.cases.length, 23); assert.equal(evidence.invalid.length, 8); assert(evidence.recoveredAfterErrors); assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(wasm.length, 1); assert.equal(wasm[0].status, 200); assert.match(wasm[0].mime, /application\/wasm/); assert(workers.some(w => w.includes('solid.worker')) && workers.some(w => w.includes('document-solver.worker')));
    results.push({ mode, evidence, workers, wasm, browserErrors: errors, passed: true });
  } finally { await context.close(); }
}
async function coldRetry(url) {
  const context = await browser.newContext(), page = await context.newPage(); let failing = true, failures = 0;
  await context.route('**/assets/solid.worker-*.js', async route => { if (failing) { failures++; await route.fulfill({ status: 503, body: '', contentType: 'application/javascript' }); } else await route.continue(); });
  try {
    await page.goto(`${url}?view=experiments`); await page.getByRole('button', { name: '运行真实网格布尔实验', exact: true }).click(); const alert = page.getByRole('alert'); await alert.waitFor(); const firstError = await alert.textContent(); assert.equal(await page.locator('[data-testid="mesh-boolean-evidence"]').count(), 0); assert(failures > 0);
    failing = false; await page.getByRole('button', { name: '运行真实网格布尔实验', exact: true }).click(); await page.locator('[data-testid="mesh-boolean-evidence"]').waitFor({ state: 'attached', timeout: 25000 }); const evidence = JSON.parse(await page.locator('[data-testid="mesh-boolean-evidence"]').textContent()); assert.equal(evidence.cases.length, 23); assert.equal(await alert.count(), 0);
    return { forcedStatus: 503, failures, firstError, noFalseSuccess: true, recoveredCases: evidence.cases.length, passed: true };
  } finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); const url = `http://127.0.0.1:${production.httpServer.address().port}/`; await check('production-root', url); const retry = await coldRetry(url);
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-mesh-booleans-cad', emptyOutDir: true } }); subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-mesh-booleans-cad' }, preview: { host: '127.0.0.1', port: 0 } }); await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-301A-mesh-booleans-browser.json', JSON.stringify({ task: 'T-301A', executedAt: new Date().toISOString(), command: 'npm run check:mesh-booleans:browser', environment: { node: process.version, browser: browser.version() }, results, retry, passed: true, limitations: ['Experiment Worker entry; workspace A/B controls remain T-301B.', 'Only Edge; final browser/performance acceptance later.'] }, null, 2) + '\n'); console.log('PASS: 23 actual extrusion-mesh Boolean cases + 8 refusals per dev/root/cad Worker, stable error codes/empty/recovery and cold Worker 503 retry.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
