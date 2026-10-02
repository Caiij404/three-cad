import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true }); let dev, production, subpath;
const json = async (page, id) => JSON.parse(await page.locator(`[data-testid="${id}"]`).textContent());
const doc = page => json(page, 'project-document-data'), sketch = page => json(page, 'active-sketch-data');
const revision = async page => Number((await page.locator('.workspace-status').textContent()).match(/revision (\d+)/)[1]);
async function change(page, action) { const before = await revision(page); await action(); await page.waitForFunction(rev => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) === rev + 1, before); }
async function point(page, x, y) { await page.getByLabel('下一点 X (mm)', { exact: true }).fill(String(x)); await page.getByLabel('下一点 Y (mm)', { exact: true }).fill(String(y)); await page.getByRole('button', { name: '输入此点', exact: true }).click(); }
async function addConstraint(page, kind, id, value) {
  const details = page.locator('.sketch-objects'); if (await details.getAttribute('open') === null) await details.locator('summary').click(); const s = await sketch(page);
  await page.locator(`[${s.points.some(p => p.id === id) ? 'data-point-select-id' : 'data-entity-id'}="${id}"]`).click(); await page.getByRole('button', { name: '约束', exact: true }).click(); await page.getByLabel('约束类型', { exact: true }).selectOption(kind);
  if (value !== undefined) await page.getByLabel('新约束数值 (mm)', { exact: true }).fill(String(value)); await change(page, () => page.getByRole('button', { name: '添加约束', exact: true }).click()); return (await sketch(page)).constraints.at(-1).id;
}
async function box(page, plane, x, y) {
  await page.getByRole('button', { name: `${plane} 平面`, exact: true }).click(); await change(page, () => page.getByRole('button', { name: '新建草图', exact: true }).click());
  await page.getByRole('button', { name: '矩形', exact: true }).click(); await point(page, x, y); await change(page, () => point(page, x + 20, y + 20)); await page.keyboard.press('Escape'); let s = await sketch(page);
  if (!s.constraints.some(c => c.kind === 'fixed' && c.refs[0].pointId === s.entities[0].startPointId)) await addConstraint(page, 'fixed', s.entities[0].startPointId);
  const widthId = await addConstraint(page, 'length', s.entities[0].id, 20); await addConstraint(page, 'length', s.entities[1].id, 20); s = await sketch(page);
  await page.getByRole('button', { name: '完成草图', exact: true }).click(); await page.locator(`[data-feature-id="${s.id}"]`).click(); await page.getByRole('button', { name: '拉伸', exact: true }).click(); await page.locator('[data-extrusion-status="ready"]').waitFor(); await page.getByLabel('拉伸深度 (mm)').fill('20');
  await page.waitForFunction(() => { const raw = document.querySelector('[data-testid="extrusion-preview-metrics"]')?.textContent; return raw && JSON.parse(raw).depth === 20; });
  await change(page, () => page.getByRole('button', { name: '确认拉伸', exact: true }).click()); await page.locator('[data-testid="committed-solid-metrics"]').waitFor({ state: 'attached' }); return { sourceId: s.id, solid: (await doc(page)).features.at(-1), widthId };
}
async function setup(page, plane = 'XY', x = 10, y = 0) {
  await page.getByRole('button', { name: '新建', exact: true }).click(); const discard = page.getByRole('button', { name: '丢弃修改并新建', exact: true }); if (await discard.isVisible()) await discard.click();
  const a = await box(page, plane, 0, 0), b = await box(page, plane, x, y); return { a, b, baseline: await doc(page) };
}
async function open(page, a, b) {
  await page.locator(`[data-feature-id="${a}"]`).click(); await page.keyboard.down('Control'); await page.locator(`[data-feature-id="${b}"]`).click(); await page.keyboard.up('Control'); await page.getByRole('button', { name: '布尔', exact: true }).click(); await page.getByRole('region', { name: '布尔运算', exact: true }).waitFor();
  assert.equal(await page.getByLabel('布尔主体 A', { exact: true }).inputValue(), a); assert.equal(await page.getByLabel('布尔工具 B', { exact: true }).inputValue(), b);
}
async function confirm(page) { await change(page, () => page.getByRole('button', { name: '确认布尔', exact: true }).click()); await page.getByRole('region', { name: '布尔运算', exact: true }).waitFor({ state: 'detached' }); return { document: await doc(page), actual: await json(page, 'committed-solid-metrics') }; }
async function planeFlow(page, plane) {
  const { a, b, baseline } = await setup(page, plane), baseRev = await revision(page); await open(page, a.solid.id, b.solid.id);
  await page.getByLabel('布尔工具 B', { exact: true }).selectOption(''); assert(await page.getByRole('button', { name: '确认布尔', exact: true }).isDisabled()); await page.getByLabel('布尔工具 B', { exact: true }).selectOption(a.solid.id); assert(await page.getByRole('button', { name: '确认布尔', exact: true }).isDisabled());
  await page.keyboard.press('Escape'); assert.deepEqual(await doc(page), baseline); assert.equal(await revision(page), baseRev);
  const cases = [];
  for (const [index, [operation, swap, expectedVolumeMm3, lo, hi]] of [['union', false, 12000, 0, 30], ['subtract', false, 4000, 0, 10], ['subtract', true, 4000, 20, 30], ['intersect', false, 4000, 10, 20]].entries()) {
    await open(page, a.solid.id, b.solid.id); await page.getByLabel('布尔操作', { exact: true }).selectOption(operation); if (swap) await page.getByRole('button', { name: '交换 A/B', exact: true }).click(); const result = await confirm(page), feature = result.document.features.at(-1);
    assert.equal(feature.kind, 'boolean'); assert.equal(feature.operandAId, swap ? b.solid.id : a.solid.id); assert.equal(feature.operandBId, swap ? a.solid.id : b.solid.id); assert.equal(feature.operation, operation);
    assert(result.actual.closed); assert(Math.abs(result.actual.signedVolume - expectedVolumeMm3) <= 1e-6); assert(result.document.features.filter(f => f.kind === 'extrude').every(f => !f.visible));
    const expectedBounds = plane === 'XY' ? { min: [lo, 0, 0], max: [hi, 20, 20] } : plane === 'XZ' ? { min: [lo, -20, 0], max: [hi, 0, 20] } : { min: [0, lo, 0], max: [20, hi, 20] };
    for (const key of ['min', 'max']) result.actual.bounds[key].forEach((v, i) => assert(Math.abs(v - expectedBounds[key][i]) <= 1e-6));
    await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); assert.deepEqual(await doc(page), baseline); await change(page, () => page.getByRole('button', { name: '重做', exact: true }).click()); assert.deepEqual(await doc(page), result.document); await page.locator(`[data-feature-id="${feature.id}"]`).click(); assert.deepEqual(await json(page, 'committed-solid-metrics'), result.actual);
    cases.push({ operation, swap, expectedVolumeMm3, expectedBounds, ...result, exactUndoRedoVisibility: true, passed: true });
    if (index < 3) await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click());
  }
  const before = await doc(page), feature = before.features.at(-1); await page.locator(`[data-feature-id="${a.sourceId}"]`).click(); await page.getByRole('button', { name: '编辑草图', exact: true }).click();
  const row = page.locator(`[data-constraint-id="${a.widthId}"]`); await row.getByLabel('约束数值 (mm)', { exact: true }).fill('25'); await change(page, () => row.getByRole('button', { name: '应用数值', exact: true }).click()); await page.getByRole('button', { name: '完成草图', exact: true }).click(); await page.locator(`[data-feature-id="${feature.id}"]`).click();
  const changed = await doc(page), actual = await json(page, 'committed-solid-metrics'); assert(Math.abs(actual.signedVolume - 6000) <= 1e-6); assert.deepEqual(changed.features.at(-1), feature);
  await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); assert.deepEqual(await doc(page), before); await change(page, () => page.getByRole('button', { name: '重做', exact: true }).click()); assert.deepEqual(await doc(page), changed); assert.deepEqual(await json(page, 'committed-solid-metrics'), actual);
  return { plane, cases, blankSameInputDisabled: true, chooseEscDocumentRevisionUnchanged: true, sourceWidthEdit: { from: 20, to: 25, actual, stableFeatureId: feature.id, exactUndoRedo: true } };
}
async function emptyAndFailure(page) {
  let { a, b, baseline } = await setup(page, 'XY', 30); await open(page, a.solid.id, b.solid.id); await page.getByLabel('布尔操作', { exact: true }).selectOption('intersect'); const empty = await confirm(page); assert.equal(empty.actual.triangles, 0); assert.equal(empty.actual.bounds, null); await page.locator('[data-solid-state="empty"]').waitFor();
  const emptyId = empty.document.features.at(-1).id; await open(page, a.solid.id, b.solid.id); assert.equal(await page.getByLabel('布尔主体 A', { exact: true }).locator(`option[value="${emptyId}"]`).count(), 0); await page.getByRole('button', { name: '取消布尔', exact: true }).click();
  await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); assert.deepEqual(await doc(page), baseline); await change(page, () => page.getByRole('button', { name: '重做', exact: true }).click()); assert.deepEqual(await doc(page), empty.document);
  ({ a, b, baseline } = await setup(page, 'XY', 20, 20)); const rev = await revision(page); await open(page, a.solid.id, b.solid.id); await page.getByRole('button', { name: '确认布尔', exact: true }).click(); await page.locator('[data-boolean-status="error"]').waitFor(); const message = await page.getByRole('alert').textContent(); assert.match(message, /有效实体|INVALID_SOLID/); assert.deepEqual(await doc(page), baseline); assert.equal(await revision(page), rev); assert(baseline.features.filter(f => f.kind === 'extrude').every(f => f.visible));
  await page.getByLabel('布尔操作', { exact: true }).selectOption('subtract'); const recovered = await confirm(page); assert(Math.abs(recovered.actual.signedVolume - 8000) <= 1e-6); assert(recovered.actual.closed);
  return { empty, emptyExcludedFromOperands: true, emptyHistoryExact: true, nonManifoldFailure: { message, authorityVisibilityHistoryUnchanged: true }, recovered, passed: true };
}
async function installHold(context) {
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      heldIds = new Set();
      constructor(url, options) {
        super(url, options); this.addEventListener('message', event => {
          if (!event.data.ok || !this.heldIds.has(event.data.requestId)) return;
          event.stopImmediatePropagation(); const data = event.data;
          window.__heldBooleanReply = { output: data.output, release: () => { this.heldIds.delete(data.requestId); this.dispatchEvent(new MessageEvent('message', { data })); } };
        }, true);
      }
      postMessage(data, ...args) { if (data.input?.kind === 'mesh-boolean' && window.__holdBoolean) this.heldIds.add(data.requestId); super.postMessage(data, ...args); }
    };
  });
}
async function pendingCancel(url, action) {
  const context = await browser.newContext(), page = await context.newPage(); await installHold(context);
  try {
    await page.goto(url); await page.locator('[data-computation="ready"]').waitFor(); await page.locator('[data-viewport-state="ready"]').waitFor(); const { a, b, baseline } = await setup(page), rev = await revision(page); await open(page, a.solid.id, b.solid.id);
    await page.evaluate(() => { window.__holdBoolean = true; }); await page.getByRole('button', { name: '确认布尔', exact: true }).click(); await page.waitForFunction(() => !!window.__heldBooleanReply); const computed = meshMetrics(await page.evaluate(() => window.__heldBooleanReply.output)); assert(Math.abs(computed.signedVolume - 12000) <= 1e-6); assert(await page.getByRole('button', { name: '撤销', exact: true }).isDisabled());
    assert.deepEqual(await doc(page), baseline); assert.equal(await revision(page), rev);
    if (action === 'new') { await page.getByRole('button', { name: '新建', exact: true }).click(); await page.getByRole('button', { name: '丢弃修改并新建', exact: true }).click(); }
    else if (action === 'button') await page.getByRole('button', { name: '取消布尔', exact: true }).click(); else await page.keyboard.press('Escape');
    await page.getByRole('region', { name: '布尔运算', exact: true }).waitFor({ state: 'detached' }); const held = await doc(page); await page.evaluate(() => { window.__holdBoolean = false; window.__heldBooleanReply.release(); }); assert.deepEqual(await doc(page), held);
    if (action === 'new') assert.equal(held.features.length, 0);
    else { assert.deepEqual(held, baseline); assert.equal(await revision(page), rev); await open(page, a.solid.id, b.solid.id); const recovered = await confirm(page); assert(Math.abs(recovered.actual.signedVolume - 12000) <= 1e-6); }
    return { action, actualRealWorkerMeshComputedBeforeHold: computed, cancelledNoHiddenInputsOrHistory: true, lateReplyDiscarded: true, recovered: action !== 'new', passed: true };
  } finally { await context.close(); }
}
async function check(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(url); await page.locator('[data-computation="ready"]').waitFor({ timeout: 15000 }); await page.locator('[data-viewport-state="ready"]').waitFor(); const planes = []; for (const plane of ['XY', 'XZ', 'YZ']) planes.push(await planeFlow(page, plane)); const boundary = await emptyAndFailure(page); assert.equal(errors.length, 0, errors.join('\n'));
    const current = await doc(page), solids = current.features.filter(f => f.kind === 'extrude'); await open(page, solids[0].id, solids[1].id); await page.screenshot({ path: `.research/T-301B-${mode.replaceAll('/', '')}.png`, fullPage: true }); results.push({ mode, planes, boundary, browserErrors: errors, passed: true });
  } catch (cause) { await page.screenshot({ path: '.research/T-301B-failure.png', fullPage: true }); console.error('Alerts:', await page.getByRole('alert').allTextContents()); throw cause; } finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); const url = `http://127.0.0.1:${production.httpServer.address().port}/`; await check('production-root', url); const cancellations = []; for (const action of ['escape', 'button', 'new']) cancellations.push(await pendingCancel(url, action));
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-boolean-ui-cad', emptyOutDir: true } }); subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-boolean-ui-cad' }, preview: { host: '127.0.0.1', port: 0 } }); await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-301B-boolean-ui-browser.json', JSON.stringify({ task: 'T-301B', executedAt: new Date().toISOString(), command: 'npm run check:boolean-ui:browser', environment: { node: process.version, browser: browser.version() }, results, cancellations, passed: true, limitations: ['Only Edge; final three-browser/performance later.', 'Worker reply holding delays actual computed geometry; no simulated result.', 'Full DAG recomputation; affected branches and cascading UI remain T-302.'] }, null, 2) + '\n'); console.log('PASS: three-entry actual Boolean A/B/order/three planes/empty/hidden input history/failure recovery/parameter recompute; actual late Worker mesh Esc/button/new cancellation.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
