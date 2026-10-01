import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true });
let dev;
let production;
let subpath;
async function check(mode, url, prefix) {
  const context = await browser.newContext();
  const errors = [];
  const assets = [];
  const workers = [];
  const page = await context.newPage();
  context.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.endsWith('/slvs.wasm') || path.endsWith('/slvs.mjs')) {
      assets.push({ path, status: response.status(), contentType: response.headers()['content-type'] });
    }
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${path}`);
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} @${message.location().url}`); });
  page.on('worker', worker => workers.push(worker.url()));
  try {
    await page.goto(`${url}?view=experiments`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '运行真实求解实验', exact: true }).click();
    await page.locator('[data-testid="solver-evidence"]').waitFor({ state: 'attached', timeout: 25_000 });
    const cases = JSON.parse(await page.locator('[data-testid="solver-evidence"]').textContent());
    assert.equal(cases.length, 8);
    assert(cases.every(item => item.passed));
    assert.equal(workers.length, 1, 'Real dedicated Worker must be created');
    const wasm = assets.find(asset => asset.path === `${prefix}wasm/slvs.wasm`);
    assert(wasm, 'Real WASM network request is required');
    assert.equal(wasm.status, 200);
    assert.match(wasm.contentType, /application\/wasm/);
    assert(assets.some(asset => asset.path === `${prefix}wasm/slvs.mjs` && asset.status === 200));
    assert.equal(errors.length, 0, errors.join('\n'));
    results.push({ mode, url, workerUrls: workers, assets, cases, browserErrors: errors, passed: true });
  } finally { await context.close(); }
}
async function checkRetry(url) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await context.route('**/wasm/slvs.wasm', route => route.fulfill({ status: 503, body: 'intentional load failure' }));
    await page.goto(`${url}?view=experiments`);
    await page.getByRole('button', { name: '运行真实求解实验', exact: true }).click();
    const alert = page.getByRole('alert');
    await alert.waitFor({ timeout: 20_000 });
    const failureMessage = await alert.innerText();
    assert.equal(await page.locator('[data-testid="solver-evidence"]').count(), 0);
    await context.unroute('**/wasm/slvs.wasm');
    await page.getByRole('button', { name: '运行真实求解实验', exact: true }).click();
    await page.locator('[data-testid="solver-evidence"]').waitFor({ state: 'attached', timeout: 25_000 });
    assert.equal(await alert.count(), 0);
    const recovered = JSON.parse(await page.locator('[data-testid="solver-evidence"]').textContent());
    assert.equal(recovered.length, 8);
    results.push({ mode: 'intentional-WASM-503-and-retry', expected: 'visible failure, no result, then successful explicit retry',
      failureMessage, recoveredCaseCount: recovered.length, passed: true });
  } finally { await context.close(); }
}
async function closePreview(server) {
  if (!server) return;
  server.httpServer.closeAllConnections();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
  await dev.listen();
  await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`, '/');
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
  const productionUrl = `http://127.0.0.1:${production.httpServer.address().port}/`;
  await check('production-root', productionUrl, '/');
  await checkRetry(productionUrl);
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-cad', emptyOutDir: true } });
  subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-cad' },
    preview: { host: '127.0.0.1', port: 0 } });
  await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`, '/cad/');
  writeFileSync(new URL(process.env.SOLVER_EVIDENCE_PATH || '../docs/learning/evidence/T-003-solver-browser.json', import.meta.url), JSON.stringify({
    task: 'T-003', executedAt: new Date().toISOString(), command: 'npm run check:solver:browser',
    environment: { node: process.version, browserChannel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', browserVersion: browser.version() },
    actualSolver: 'Real public/wasm/slvs.mjs + slvs.wasm in dedicated Worker', results, passed: true,
    limitations: ['Technical fixtures, not complete P0 constraint UI or editable document transaction.'],
  }, null, 2) + '\n');
  console.log('PASS: real Worker solve in development, root production, /cad/; visible 503 failure and explicit retry.');
} finally {
  if (dev) await dev.close();
  await closePreview(production);
  await closePreview(subpath);
  await browser.close();
}
