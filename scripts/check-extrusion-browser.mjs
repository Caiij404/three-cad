import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true });
let dev, production, subpath;
async function check(mode, url) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [], workers = [], wasm = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('worker', w => workers.push(w.url()));
  context.on('response', r => { if (r.url().endsWith('slvs.wasm')) wasm.push({ url: r.url(), status: r.status(), mime: r.headers()['content-type'] }); });
  try {
    await page.goto(`${url}?view=experiments`); await page.getByRole('button', { name: '运行一般拉伸实验', exact: true }).click();
    const output = page.locator('[data-testid="extrusion-evidence"]'); await output.waitFor({ state: 'attached', timeout: 25000 });
    const evidence = JSON.parse(await output.textContent()); assert.equal(evidence.cases.length, 60); assert.equal(evidence.invalid.length, 10);
    assert(evidence.cases.every(c => c.passed && c.actual.closed && c.normalFailures === 0 && c.holeWallFailures === 0)); assert(evidence.invalid.every(c => c.passed && c.actualCode === c.expectedCode));
    assert.equal(workers.filter(w => w.includes('document-solver.worker')).length, 1); assert.equal(workers.filter(w => w.includes('solid.worker')).length, 1);
    assert.equal(wasm.length, 1); assert.equal(wasm[0].mime.split(';')[0], 'application/wasm'); assert.equal(errors.length, 0, errors.join('\n'));
    results.push({ mode, url, workers, wasm, ...evidence, browserErrors: errors, passed: true });
  } finally { await context.close(); }
}
async function checkColdRetry(url) {
  const context = await browser.newContext(), page = await context.newPage(); let failing = true, failures = 0;
  await context.route('**/wasm/slvs.wasm', async route => { if (failing) { failures++; await route.fulfill({ status: 503, contentType: 'application/wasm', body: '' }); } else await route.continue(); });
  try {
    await page.goto(`${url}?view=experiments`); await page.getByRole('button', { name: '运行一般拉伸实验', exact: true }).click();
    const alert = page.getByRole('alert'); await alert.waitFor(); const message = await alert.textContent(); assert.equal(await page.locator('[data-testid="extrusion-evidence"]').count(), 0);
    failing = false; await page.getByRole('button', { name: '运行一般拉伸实验', exact: true }).click(); await page.locator('[data-testid="extrusion-evidence"]').waitFor({ state: 'attached', timeout: 25000 });
    const evidence = JSON.parse(await page.locator('[data-testid="extrusion-evidence"]').textContent()); assert.equal(evidence.cases.length, 60); assert.equal(await alert.count(), 0);
    return { forcedStatus: 503, failedHttpAttempts: failures, firstError: message, noFalseEvidence: true, rerunCases: evidence.cases.length, rerunInvalid: evidence.invalid.length, passed: true };
  } finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); const devUrl = `http://127.0.0.1:${dev.httpServer.address().port}/`;
  await check('development', devUrl); const coldRetry = await checkColdRetry(devUrl);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); await check('production-root', `http://127.0.0.1:${production.httpServer.address().port}/`);
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-extrusion-cad', emptyOutDir: true } });
  subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-extrusion-cad' }, preview: { host: '127.0.0.1', port: 0 } });
  await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-202C1-extrusion-browser.json', JSON.stringify({ task: 'T-202C1', executedAt: new Date().toISOString(), command: 'npm run check:extrusion:browser',
    environment: { node: process.version, browser: browser.version(), three: '0.186.1' }, results, coldRetry, passed: true,
    limitations: ['Experimental Worker entry only; workspace extrusion UI/preview/transactions/full REQ-006 still pending C2.', 'Only Edge measured; final three-browser/performance checks remain later.'] }, null, 2) + '\n');
  console.log('PASS: 60 general extrusion + 10 refusal cases per dev/root/cad Worker, signed normals/holes, error recovery, WASM MIME/one load and cold 503 retry.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
