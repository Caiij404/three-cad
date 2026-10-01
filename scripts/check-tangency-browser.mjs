import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true }); let dev, production, subpath;
async function check(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = [], resources = [], workers = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('worker', w => workers.push(w.url())); page.on('response', r => { if (r.url().includes('/wasm/slvs.wasm')) resources.push({ url: r.url(), status: r.status(), mime: r.headers()['content-type'] }); });
  try {
    await page.goto(`${url}?view=experiments`); await page.getByRole('button', { name: '运行全组合相切', exact: true }).click();
    await page.locator('[data-testid="tangent-transaction-evidence"]').waitFor({ state: 'attached', timeout: 30000 });
    const fixtures = JSON.parse(await page.locator('[data-testid="tangent-evidence"]').textContent()), transaction = JSON.parse(await page.locator('[data-testid="tangent-transaction-evidence"]').textContent());
    assert.equal(fixtures.cases.length, 51); assert(fixtures.cases.every(c => c.passed)); assert.equal(fixtures.refused.length, 3);
    assert(fixtures.refused.every(c => c.code === 'TANGENT_RANGE')); assert(transaction.passed); assert.equal(transaction.failures.length, 3);
    transaction.distancesMm.forEach((value, i) => assert(Math.abs(value - [18, 22, 18, 22][i]) <= 1e-5));
    assert(workers.some(url => url.includes('document-solver.worker'))); assert(resources.some(r => r.status === 200 && r.mime?.includes('application/wasm')));
    assert.equal(resources.filter(r => r.status === 200).length, 1, 'domain failures must retain the loaded module');
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.screenshot({ path: `.research/T-201B2-${mode.replaceAll('/', '')}.png`, fullPage: true });
    results.push({ mode, fixtures, transaction, resources, workers, browserErrors: errors, passed: true });
  } finally { await context.close(); }
}
async function retry(url) {
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await context.route('**/wasm/slvs.wasm', route => route.fulfill({ status: 503, body: 'intentional tangent load failure' }));
    await page.goto(`${url}?view=experiments`); await page.getByRole('button', { name: '运行全组合相切', exact: true }).click(); await page.getByRole('alert').waitFor();
    const message = await page.getByRole('alert').textContent(); await context.unroute('**/wasm/slvs.wasm');
    await page.getByRole('button', { name: '运行全组合相切', exact: true }).click(); await page.locator('[data-testid="tangent-transaction-evidence"]').waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(JSON.parse(await page.locator('[data-testid="tangent-evidence"]').textContent()).cases.length, 51);
    results.push({ mode: '503-retry', message, realNativeCasesAfterRetry: 51, passed: true });
  } finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); const url = `http://127.0.0.1:${production.httpServer.address().port}/`; await check('production-root', url); await retry(url);
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-tangent-cad', emptyOutDir: true } });
  subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-tangent-cad' }, preview: { host: '127.0.0.1', port: 0 } });
  await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-201B2-tangency-browser.json', JSON.stringify({ task: 'T-201B2', executedAt: new Date().toISOString(), command: 'npm run check:tangency:browser', environment: { node: process.version, browser: browser.version() }, results, passed: true, limitations: ['Only actual Edge measured here; final three-browser/performance acceptance is later.', 'Constraint panel and full REQ-005 remain T-201C.'] }, null, 2) + '\n');
  console.log('PASS: three entrances ×51 actual tangent cases, finite-range refusal/transaction, one native module per run and explicit 503 retry.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
