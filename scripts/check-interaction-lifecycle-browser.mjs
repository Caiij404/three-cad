import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';

const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true });
let dev, production, subpath;
const json = async (page, id) => JSON.parse(await page.locator(`[data-testid="${id}"]`).textContent());
const doc = page => json(page, 'project-document-data'), sketch = page => json(page, 'active-sketch-data');
const geometryDocument = document => ({...document,view:null,updatedAt:''});
const revision = async page => Number((await page.locator('.workspace-status').textContent()).match(/revision (\d+)/)[1]);
const select = (page, id) => page.locator(`[data-feature-id="${id}"]`).click();
const requests = page => page.evaluate(() => structuredClone(window.__geometryRequests));
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function change(page, action) {
  const before = await revision(page); await action();
  await page.waitForFunction(r => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) === r + 1, before);
}
async function point(page, x, y) {
  await page.getByLabel('下一点 X (mm)', { exact: true }).fill(String(x));
  await page.getByLabel('下一点 Y (mm)', { exact: true }).fill(String(y));
  await page.getByRole('button', { name: '输入此点', exact: true }).click();
}
async function fresh(page) {
  await page.getByRole('button', { name: '新建', exact: true }).click();
  const discard = page.getByRole('button', { name: '丢弃修改并新建', exact: true });
  if (await discard.isVisible()) await discard.click();
}
async function rectangle(page) {
  await page.getByRole('button', { name: 'XY 平面', exact: true }).click();
  await change(page, () => page.getByRole('button', { name: '新建草图', exact: true }).click());
  await page.getByRole('button', { name: '矩形', exact: true }).click(); await point(page, 0, 0);
  await change(page, () => point(page, 20, 20)); await page.keyboard.press('Escape');
  const s = await sketch(page); await page.locator('.sketch-objects summary').click();
  await page.locator(`[data-entity-id="${s.entities[0].id}"]`).click();
  await page.getByRole('button', { name: '约束', exact: true }).click();
  await page.getByLabel('约束类型', { exact: true }).selectOption('length');
  await page.getByLabel('新约束数值 (mm)', { exact: true }).fill('20');
  await change(page, () => page.getByRole('button', { name: '添加约束', exact: true }).click());
  const widthId = (await sketch(page)).constraints.at(-1).id;
  await page.getByRole('button', { name: '完成草图', exact: true }).click(); await select(page, s.id);
  return { sourceId: s.id, widthId };
}
async function openExtrusion(page, sourceId, depth = 10) {
  await select(page, sourceId); await page.getByRole('button', { name: '拉伸', exact: true }).click();
  await page.locator('[data-extrusion-status="ready"]').waitFor();
  await page.getByLabel('拉伸深度 (mm)', { exact: true }).fill(String(depth));
  await page.waitForFunction(d => {
    const raw = document.querySelector('[data-testid="extrusion-preview-metrics"]')?.textContent;
    return raw && JSON.parse(raw).depth === d;
  }, depth);
}
function volume(mesh, expected) {
  const actual = meshMetrics(mesh); assert(actual.closed && actual.windingErrors === 0);
  assert(Math.abs(actual.signedVolume - expected) <= 1e-6, `${actual.signedVolume} != ${expected}`); return actual;
}
async function installHold(context) {
  await context.addInitScript(() => {
    window.__geometryRequests = []; const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      heldIds = new Set();
      constructor(url, options) {
        super(url, options);
        this.addEventListener('message', event => {
          if (!event.data.ok || !this.heldIds.has(event.data.requestId)) return;
          event.stopImmediatePropagation(); const data = event.data;
          window.__heldReply = { output: data.output, release: () => {
            this.heldIds.delete(data.requestId); this.dispatchEvent(new MessageEvent('message', { data }));
          } };
        }, true);
      }
      postMessage(data, ...args) {
        const input = data.input, kind = input?.sketch && !input.kind ? 'sketch-solve' : input?.kind;
        if (kind) window.__geometryRequests.push({ kind, sketchId: input.sketch?.id });
        if (kind && kind === window.__holdKind) this.heldIds.add(data.requestId);
        super.postMessage(data, ...args);
      }
    };
  });
}
const hold = (page, kind) => page.evaluate(k => { window.__holdKind = k; window.__heldReply = null; }, kind);
const release = page => page.evaluate(() => { window.__holdKind = null; window.__heldReply.release(); });
const labels = page => page.locator('[data-dimension-id]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.dimensionId, x: parseFloat(n.style.left), y: parseFloat(n.style.top) })));
async function waitMoved(page, previous) {
  await page.waitForFunction(before => [...document.querySelectorAll('[data-dimension-id]')].some(n => {
    const old = before.find(p => p.id === n.dataset.dimensionId);
    return old && Math.hypot(parseFloat(n.style.left) - old.x, parseFloat(n.style.top) - old.y) > 1;
  }), previous);
}
async function busyNavigation(page) {
  const { sourceId, widthId } = await rectangle(page); await openExtrusion(page, sourceId);
  await change(page, () => page.getByRole('button', { name: '确认拉伸', exact: true }).click());
  const solidId = (await doc(page)).features.at(-1).id;
  await select(page, sourceId); await page.getByRole('button', { name: '编辑草图', exact: true }).click();
  const before = await doc(page), oldRev = await revision(page);
  const row = page.locator(`[data-constraint-id="${widthId}"]`);
  await row.getByLabel('约束数值 (mm)', { exact: true }).fill('25'); await hold(page, 'sketch-solve');
  await row.getByRole('button', { name: '应用数值', exact: true }).click(); await page.waitForFunction(() => !!window.__heldReply);
  const computed = await page.evaluate(() => window.__heldReply.output), line = computed.sketch.entities.find(e => e.kind === 'line');
  const at = id => computed.sketch.points.find(p => p.id === id).position, a = at(line.startPointId), b = at(line.endPointId);
  const actualLengthMm = Math.hypot(a[0] - b[0], a[1] - b[1]); assert(Math.abs(actualLengthMm - 25) <= 1e-5);
  assert(await page.getByRole('button', { name: '撤销', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: '矩形', exact: true }).isDisabled()); assert.deepEqual(await doc(page), before);
  const r = await page.locator('canvas').boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
  const beforePan = await labels(page); assert(beforePan.length);
  await page.mouse.move(x, y); await page.mouse.down({ button: 'middle' });
  await page.mouse.move(x + 30, y + 15, { steps: 4 }); await page.mouse.up({ button: 'middle' }); await waitMoved(page, beforePan);
  const afterPan = await labels(page); await page.mouse.wheel(0, -160); await waitMoved(page, afterPan); const afterZoom = await labels(page);
  const selection = (await page.locator('.workspace-status').textContent()).match(/\d+ 个对象选中/)[0];
  await page.mouse.click(x, y); assert.equal((await page.locator('.workspace-status').textContent()).match(/\d+ 个对象选中/)[0], selection);
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 40, y + 20, { steps: 4 }); await page.mouse.up({ button: 'right' }); await settle(page);
  const navigated=await doc(page);assert.notDeepEqual(navigated.view,before.view);
  assert.deepEqual(await labels(page), afterZoom); assert.deepEqual(geometryDocument(navigated), geometryDocument(before)); assert.equal(await revision(page), oldRev);
  await page.keyboard.press('Escape'); await release(page); await settle(page);
  assert.deepEqual(await doc(page), navigated); assert.equal(await revision(page), oldRev);
  await row.getByLabel('约束数值 (mm)', { exact: true }).fill('25');
  await change(page, () => row.getByRole('button', { name: '应用数值', exact: true }).click());
  await page.getByRole('button', { name: '完成草图', exact: true }).click(); await select(page, solidId);
  const actual = await json(page, 'committed-solid-metrics'); assert(Math.abs(actual.signedVolume - 5000) <= 1e-6);
  return { actualLengthMm, beforePan, afterPan, afterZoom, editAndSelectionDisabled: true, sketchRotationLocked: true, cancelKeptGeometryRevisionAndLatestNavigation: true, recoveredVolumeMm3: actual.signedVolume };
}
async function folding(page) {
  await fresh(page); const { sourceId } = await rectangle(page); await openExtrusion(page, sourceId, 12);
  const previewRequests = await requests(page);
  await page.getByRole('button', { name: '折叠属性', exact: true }).click(); await page.getByRole('button', { name: '展开属性', exact: true }).click();
  assert.equal(await page.getByLabel('拉伸深度 (mm)', { exact: true }).inputValue(), '12'); assert.deepEqual(await requests(page), previewRequests);
  const before = await doc(page), oldRev = await revision(page); await hold(page, 'sketch-extrusion');
  await page.getByRole('button', { name: '确认拉伸', exact: true }).click(); await page.waitForFunction(() => !!window.__heldReply);
  const actual = volume(await page.evaluate(() => window.__heldReply.output), 4800), submittingRequests = await requests(page);
  await page.getByRole('button', { name: '折叠属性', exact: true }).click(); await page.getByRole('button', { name: '展开属性', exact: true }).click();
  assert.equal(await page.locator('[data-extrusion-status]').getAttribute('data-extrusion-status'), 'submitting');
  assert(await page.getByRole('button', { name: '确认拉伸', exact: true }).isDisabled()); assert.deepEqual(await doc(page), before);
  assert.deepEqual(await requests(page), submittingRequests); assert.deepEqual(await page.getByRole('alert').allTextContents(), []);
  await page.getByRole('button', { name: '折叠属性', exact: true }).click(); await release(page);
  await page.waitForFunction(r => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) === r + 1, oldRev);
  await page.locator('[data-extrusion-status]').waitFor({ state: 'detached' }); await page.getByRole('button', { name: '展开属性', exact: true }).click();
  const after = await doc(page), solids = after.features.filter(f => f.kind === 'extrude' && f.sketchId === sourceId); assert.equal(solids.length, 1);
  assert.equal(await page.getByRole('button', { name: '选择', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('region', { name: '编辑拉伸参数', exact: true }).waitFor(); assert.equal((await json(page, 'committed-solid-metrics')).signedVolume, actual.signedVolume);
  await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); assert.deepEqual(await doc(page), before);
  await change(page, () => page.getByRole('button', { name: '重做', exact: true }).click()); assert.deepEqual(await doc(page), after);
  await openExtrusion(page, sourceId); const cancelBefore = await doc(page), cancelRevision = await revision(page);
  await hold(page, 'sketch-extrusion'); await page.getByRole('button', { name: '确认拉伸', exact: true }).click(); await page.waitForFunction(() => !!window.__heldReply);
  const cancelledActual = volume(await page.evaluate(() => window.__heldReply.output), 4000);
  await page.getByRole('button', { name: '折叠属性', exact: true }).click(); await page.keyboard.press('Escape'); await release(page); await settle(page);
  assert.deepEqual(await doc(page), cancelBefore); assert.equal(await revision(page), cancelRevision);
  await page.getByRole('button', { name: '展开属性', exact: true }).click(); await openExtrusion(page, sourceId);
  await change(page, () => page.getByRole('button', { name: '确认拉伸', exact: true }).click());
  assert.equal((await doc(page)).features.filter(f => f.kind === 'extrude' && f.sketchId === sourceId).length, 2);
  return { depthDraftMm: 12, foldingReissuedRequests: 0, actualCommittedVolumeMm3: actual.signedVolume, addedFeatures: after.features.length - before.features.length, completedWhileHidden: true, returnedToModelSelection: true, exactUndoRedo: true, cancelledComputedVolumeMm3: cancelledActual.signedVolume, hiddenEscapeRejectedLateReply: true, freshCommitAfterCancel: true };
}
async function check(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await installHold(context);
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(url); await page.locator('[data-computation="ready"]').waitFor({ timeout: 15000 }); await page.locator('[data-viewport-state="ready"]').waitFor();
    const navigation = await busyNavigation(page), panel = await folding(page); assert.deepEqual(errors, []);
    results.push({ mode, navigation, panel, browserErrors: errors, passed: true });
  } finally { await context.close(); }
}
async function closePreview(server) {
  if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve()));
}
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  if (process.env.INTERACTION_DEV_ONLY !== '1') {
    production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); await check('production-root', `http://127.0.0.1:${production.httpServer.address().port}/`);
    await build({ root, base: '/cad/', build: { outDir: '.research/dist-interaction-cad', emptyOutDir: true } });
    subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-interaction-cad' }, preview: { host: '127.0.0.1', port: 0 } }); await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  }
  writeFileSync(process.env.INTERACTION_EVIDENCE_PATH ?? 'docs/learning/evidence/T-R01-interaction-browser.json', JSON.stringify({ task: 'T-R01', executedAt: new Date().toISOString(), command: 'npm run check:interaction:browser', environment: { node: process.version, platform: process.platform, browser: browser.version(), vue: '3.5.43', three: '0.186.1' }, results, tolerances: { straightVolumeMm3: 1e-6, lengthMm: 1e-5, navigationMovementCssPx: 1 }, passed: true, limitations: ['Only Edge; final three-browser/performance acceptance remains pending.', 'Replies delay real WASM/mesh output; no synthetic geometry.', 'Camera movement uses rendered dimension positions, including production builds; no production introspection hook.'] }, null, 2) + '\n');
  console.log('PASS: busy pan/zoom with edits blocked; folding preserves previews, drafts and one atomic commit/history; hidden Esc rejects actual late mesh and retry recovers.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
