import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const channel = process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge';
const lockBytes = readFileSync(path.join(root, 'package-lock.json'));
const lock = JSON.parse(lockBytes);
const forbidden = ['react', 'react-dom', 'redux', 'react-redux'];
for (const name of forbidden) {
  assert(!Object.keys(lock.packages).some(key => key.endsWith(`node_modules/${name}`)), `${name} is forbidden`);
}
const versions = Object.fromEntries(Object.keys({ ...lock.packages[''].dependencies,
  ...lock.packages[''].devDependencies }).sort().map(name => [
  name, JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version,
]));
const results = [];
let browser;
let dev;
let production;

async function checkPage(mode, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const modules = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    if (/javascript/.test(response.headers()['content-type'] || '')) {
      modules.push(new URL(response.url()).pathname);
    }
  });
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: 'Vue 已启动', exact: true }).waitFor();
    const counter = page.getByLabel('实验计数', { exact: true });
    const initialCount = await counter.innerText();
    assert.equal(initialCount, '0');
    await page.getByRole('button', { name: '计数 +1', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('output')?.textContent === '1');
    const afterClick = await counter.innerText();
    assert.equal(afterClick, '1');
    assert(await page.getByRole('button', { name: '运行求解', exact: true }).isDisabled());
    assert(await page.getByRole('button', { name: '运行 CSG', exact: true }).isDisabled());
    assert.equal(errors.length, 0, errors.join('\n'));
    if (mode === 'development') assert(modules.some(module => module.startsWith('/src/App.vue')));
    else assert(modules.some(module => module.startsWith('/assets/') && module.endsWith('.js')));
    // The same flow at a narrow viewport verifies that the controls remain reachable.
    await page.setViewportSize({ width: 390, height: 844 });
    const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert(fitsViewport, 'The bootstrap page must not overflow horizontally');
    if (mode === 'production') {
      await page.setViewportSize({ width: 1280, height: 900 });
      mkdirSync(path.join(root, '.research'), { recursive: true });
      await page.screenshot({ path: path.join(root, '.research/bootstrap-preview.png'), fullPage: true });
    }
    results.push({ mode, url, status: response.status(), initialCount, afterClick,
      unimplementedButtonsDisabled: true, browserErrors: errors, javascriptRequests: modules,
      narrowViewport: { width: 390, horizontalOverflow: !fitsViewport }, passed: true });
  } finally { await page.close(); }
}

try {
  browser = await chromium.launch({ channel, headless: true });
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
  await dev.listen();
  await checkPage('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
  await checkPage('production', `http://127.0.0.1:${production.httpServer.address().port}/`);
  const evidence = { task: 'T-002', learningUnit: 'L-001B', executedAt: new Date().toISOString(),
    command: 'npm run check:bootstrap',
    serverEntryPoints: ['vite.createServer (development)', 'vite.preview (production dist)'],
    environment: { node: process.version, platform: process.platform, arch: process.arch,
      browserChannel: channel, browserVersion: browser.version(), versions },
    lockfileSha256: createHash('sha256').update(lockBytes).digest('hex'),
    forbiddenDependenciesAbsent: forbidden, results, passed: true,
    limitations: ['No solver, CSG, Worker, /cad/ WASM asset, or CAD acceptance verified.',
      'Browser verification covers this installed browser only.'] };
  writeFileSync(path.join(root, 'docs/learning/evidence/T-002-bootstrap.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`PASS: development and production, count 0→1, disabled operations, no browser errors; ${channel} ${browser.version()}.`);
  console.log('Evidence: docs/learning/evidence/T-002-bootstrap.json');
} finally {
  if (dev) await dev.close();
  if (production) {
    production.httpServer.closeAllConnections();
    await new Promise((resolve, reject) => production.httpServer.close(error => error ? reject(error) : resolve()));
  }
  if (browser) await browser.close();
}
