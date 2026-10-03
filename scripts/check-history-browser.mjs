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
const feature = (page, id) => page.locator(`[data-feature-id="${id}"]`).click();
const undo = page => page.getByRole('button', { name: '撤销', exact: true }), redo = page => page.getByRole('button', { name: '重做', exact: true });
async function change(page, action) { const before = await revision(page); await action(); await page.waitForFunction(rev => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) === rev + 1, before); }
async function point(page, x, y) { await page.getByLabel('下一点 X (mm)', { exact: true }).fill(String(x)); await page.getByLabel('下一点 Y (mm)', { exact: true }).fill(String(y)); await page.getByRole('button', { name: '输入此点', exact: true }).click(); }
async function draw(page, tool, points) { await page.getByRole('button', { name: tool, exact: true }).click(); for (const p of points.slice(0, -1)) await point(page, ...p); await change(page, () => point(page, ...points.at(-1))); await page.keyboard.press('Escape'); }
async function objects(page) { const details = page.locator('.sketch-objects'); if (await details.getAttribute('open') === null) await details.locator('summary').click(); }
async function constraint(page, kind, id, value) {
  await objects(page); const s = await sketch(page); await page.locator(`[${s.points.some(p => p.id === id) ? 'data-point-select-id' : 'data-entity-id'}="${id}"]`).click();
  await page.getByRole('button', { name: '约束', exact: true }).click(); await page.getByLabel('约束类型', { exact: true }).selectOption(kind);
  if (value !== undefined) await page.getByLabel('新约束数值 (mm)', { exact: true }).fill(String(value)); await change(page, () => page.getByRole('button', { name: '添加约束', exact: true }).click()); return (await sketch(page)).constraints.at(-1).id;
}
async function start(page) { await page.getByRole('button', { name: 'XY 平面', exact: true }).click(); await change(page, () => page.getByRole('button', { name: '新建草图', exact: true }).click()); }
async function finish(page) { const s = await sketch(page); await page.getByRole('button', { name: '完成草图', exact: true }).click(); await feature(page, s.id); return s; }
async function extrude(page, depth = 20) {
  await page.getByRole('button', { name: '拉伸', exact: true }).click(); await page.locator('[data-extrusion-status="ready"]').waitFor(); await page.getByLabel('拉伸深度 (mm)', { exact: true }).fill(String(depth));
  await page.waitForFunction(d => { const raw = document.querySelector('[data-testid="extrusion-preview-metrics"]')?.textContent; return raw && JSON.parse(raw).depth === d; }, depth);
  await change(page, () => page.getByRole('button', { name: '确认拉伸', exact: true }).click()); return (await doc(page)).features.at(-1);
}
async function depth(page, id, value) { await feature(page, id); await page.getByLabel('现有拉伸深度 (mm)', { exact: true }).fill(String(value)); await change(page, () => page.getByRole('button', { name: '应用拉伸参数', exact: true }).click()); }
async function metrics(page) { const output = {}; for (const f of (await doc(page)).features.filter(f => f.kind !== 'sketch')) { await feature(page, f.id); output[f.id] = await json(page, 'committed-solid-metrics'); } return output; }
async function authority(page) {
  const document = await doc(page), diagnostic = page.locator('[data-testid="active-sketch-diagnostics"]');
  return { document, metrics: await metrics(page), diagnostics: await diagnostic.count() ? JSON.parse(await diagnostic.textContent()) : null };
}
function volume(actual, expected) { assert(actual.closed && actual.windingErrors === 0); assert(Math.abs(actual.signedVolume - expected) <= 1e-6, `${actual.signedVolume} != ${expected}`); }
async function keyboard(page, key) { await page.locator('canvas').focus(); await change(page, () => page.keyboard.press(key)); }
async function verified(page, operations, label, action) {
  const before = await authority(page); await action(); const after = await authority(page), calls = await page.evaluate(() => window.__historyRequests.length);
  await change(page, () => undo(page).click()); assert.deepEqual(await authority(page), before);
  await keyboard(page, operations.length % 2 ? 'Control+y' : 'Control+Shift+z'); assert.deepEqual(await authority(page), after);
  assert.equal(await page.evaluate(() => window.__historyRequests.length), calls);
  operations.push({ label, exactDocumentMeshMetricsDiagnosticsUndoRedo: true, restoreWorkerCalls: 0 }); return after;
}
async function installProbe(context) {
  await context.addInitScript(() => {
    window.__historyRequests = []; const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      heldIds = new Set();
      constructor(...args) { super(...args); this.addEventListener('message', event => { if (!event.data.ok || !this.heldIds.has(event.data.requestId)) return; event.stopImmediatePropagation(); const data = event.data; window.__heldHistory = { output: data.output, release: () => { this.heldIds.delete(data.requestId); this.dispatchEvent(new MessageEvent('message', { data })); } }; }, true); }
      postMessage(data, ...args) { const input = data.input; if (input && (input.sketch || input.kind === 'mesh-boolean')) { window.__historyRequests.push({ kind: input.kind ?? 'solve', id: input.sketch?.id, operation: input.operation }); if (window.__holdHistory && input.kind === 'sketch-extrusion') this.heldIds.add(data.requestId); } super.postMessage(data, ...args); }
    };
  });
}
async function operationsFlow(page) {
  const operations = [], initial = await doc(page); assert.match(await page.locator('.workspace-header').textContent(), /未修改/);
  await start(page); const emptySketch = await doc(page); await keyboard(page, 'Control+z'); assert.deepEqual(await doc(page), initial); assert.match(await page.locator('.workspace-header').textContent(), /未修改/);
  await keyboard(page, 'Control+Shift+z'); assert.deepEqual(await doc(page), emptySketch); assert.match(await page.locator('.workspace-header').textContent(), /未保存的修改/);
  await feature(page, emptySketch.features[0].id); await page.getByRole('button', { name: '编辑草图', exact: true }).click();
  await verified(page, operations, 'draw-rectangle', () => draw(page, '矩形', [[0, 0], [20, 20]]));
  const rectangle = await sketch(page); let widthId;
  await verified(page, operations, 'add-width', async () => { widthId = await constraint(page, 'length', rectangle.entities[0].id, 20); });
  await verified(page, operations, 'add-height', () => constraint(page, 'length', rectangle.entities[1].id, 20));
  await verified(page, operations, 'edit-dimension', async () => { const row = page.locator(`[data-constraint-id="${widthId}"]`); await row.getByLabel('约束数值 (mm)', { exact: true }).fill('25'); await change(page, () => row.getByRole('button', { name: '应用数值', exact: true }).click()); });
  await verified(page, operations, 'remove-constraint', () => change(page, () => page.locator(`[data-constraint-id="${widthId}"]`).getByRole('button', { name: '删除约束', exact: true }).click()));
  for (const [tool, points] of [['线段', [[40, 0], [50, 0]]], ['圆', [[50, 10], [55, 10]]], ['圆弧', [[60, 0], [65, 5], [70, 0]]]]) {
    await verified(page, operations, `draw-${tool}`, () => draw(page, tool, points));
    const id = (await sketch(page)).entities.at(-1).id;
    await verified(page, operations, `delete-${tool}`, async () => { await objects(page); await page.locator(`[data-entity-id="${id}"]`).click(); await change(page, () => page.getByRole('button', { name: '删除选中实体', exact: true }).click()); });
  }
  await verified(page, operations, '30-move-one-drag', async () => {
    await page.getByRole('button', { name: '选择', exact: true }).click(); const box = await page.locator('canvas').boundingBox(), scale = box.height / (70 * Math.SQRT2 * 1.2);
    await page.mouse.move(box.x + box.width / 2 + 25 * scale, box.y + box.height / 2 - 20 * scale); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 30 * scale, box.y + box.height / 2 - 20 * scale, { steps: 30 }); await change(page, () => page.mouse.up());
  });
  const s = await sketch(page), xs = s.points.map(p => p.position[0]); assert(Math.abs(Math.max(...xs) - Math.min(...xs) - 30) <= 1e-5);
  // Mouse projection has a length tolerance; lock the analytic fixture before asserting 1e-6 mm³ volumes.
  await verified(page, operations, 'dimension-after-drag', () => constraint(page, 'length', s.entities[0].id, 30));
  const a = await finish(page); let solidA;
  const extruded = await verified(page, operations, 'extrude', async () => { solidA = await extrude(page); }); volume(extruded.metrics[solidA.id], 12000);
  await start(page); await draw(page, '矩形', [[10, 0], [30, 20]]); await finish(page); const solidB = await extrude(page); let result;
  const joined = await verified(page, operations, 'boolean-and-source-hiding', async () => {
    await feature(page, solidA.id); await page.keyboard.down('Control'); await feature(page, solidB.id); await page.keyboard.up('Control'); await page.getByRole('button', { name: '布尔', exact: true }).click(); await page.getByLabel('布尔操作', { exact: true }).selectOption('intersect');
    await change(page, () => page.getByRole('button', { name: '确认布尔', exact: true }).click()); result = (await doc(page)).features.at(-1);
  }); volume(joined.metrics[result.id], 8000);
  await verified(page, operations, 'edit-depth-with-descendant', () => depth(page, solidA.id, 30));
  await verified(page, operations, 'rename-project', async () => { await page.getByLabel('项目名称', { exact: true }).fill('历史验收'); await change(page, () => page.getByRole('button', { name: '应用名称', exact: true }).click()); });
  await verified(page, operations, 'rename-feature', async () => { await feature(page, result.id); await page.getByLabel('特征名称', { exact: true }).fill('历史结果'); await change(page, () => page.getByRole('button', { name: '应用特征名称', exact: true }).click()); });
  await verified(page, operations, 'hide', async () => { await feature(page, result.id); await change(page, () => page.getByRole('button', { name: '隐藏特征', exact: true }).click()); });
  await verified(page, operations, 'show', async () => { await feature(page, result.id); await change(page, () => page.getByRole('button', { name: '显示特征', exact: true }).click()); });
  const cascaded = await verified(page, operations, 'cascade-delete', async () => {
    await feature(page, a.id); await page.getByRole('button', { name: '删除特征', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '删除来源会影响后代', exact: true }); await dialog.waitFor();
    await change(page, () => dialog.getByRole('button', { name: '级联删除来源及后代', exact: true }).click()); await dialog.waitFor({ state: 'detached' });
  }); assert.deepEqual(cascaded.document.features.map(f => f.id), [(await doc(page)).features[0].id, solidB.id]);
  await keyboard(page, 'Control+z'); // Restore the fixture and leave a redo branch for busy/cancel checks.
  const beforeFocus = await doc(page), focusRevision = await revision(page); await page.getByLabel('项目名称', { exact: true }).focus(); await page.keyboard.press('Control+z'); assert.deepEqual(await doc(page), beforeFocus); assert.equal(await revision(page), focusRevision);
  return { operations, source: a, solidA, solidB, result, textFocusProtectsModelHistory: true, emptySnapshotRestoresCleanMarker: true };
}
async function pendingFlow(page, fixture) {
  const before = await authority(page), rev = await revision(page); assert(!await redo(page).isDisabled()); await feature(page, fixture.solidA.id);
  await page.getByLabel('现有拉伸深度 (mm)', { exact: true }).fill('40'); await page.evaluate(() => { window.__holdHistory = true; }); await page.getByRole('button', { name: '应用拉伸参数', exact: true }).click(); await page.waitForFunction(() => !!window.__heldHistory);
  const actual = meshMetrics(await page.evaluate(()=>({positions:Array.from(window.__heldHistory.output.positions)}))); volume(actual, 24000); assert(await undo(page).isDisabled() && await redo(page).isDisabled());
  await page.locator('canvas').focus(); for (let i = 0; i < 10; i++) { await page.keyboard.press('Control+z'); await page.keyboard.press('Control+y'); }
  assert.deepEqual(await doc(page), before.document); assert.equal(await revision(page), rev); await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__holdHistory = false; window.__heldHistory.release(); }); assert.deepEqual(await authority(page), before); assert.equal(await revision(page), rev); assert(!await redo(page).isDisabled());
  await keyboard(page, 'Control+y'); assert(!await page.locator(`[data-feature-id="${fixture.solidA.id}"]`).count()); await keyboard(page, 'Control+z'); assert.deepEqual(await authority(page), before);
  await depth(page, fixture.solidA.id, 40); assert(await redo(page).isDisabled()); volume((await metrics(page))[fixture.solidA.id], 24000);
  return { actualHeldVolumeMm3: actual.signedVolume, ignoredBusyShortcuts: 20, cancelledLateReplyNoRevisionOrHistory: true, redoPreservedAfterCancel: true, successfulBranchClearsRedo: true, passed: true };
}
async function capacityFlow(page, fixture) {
  const snapshots = [await authority(page)], realDepths = [];
  for (let i = 1; i <= 105; i++) {
    if (i % 3 === 0) { await depth(page, fixture.solidA.id, 40 + i); realDepths.push({ step: i, depthMm: 40 + i, expectedVolumeMm3: 600 * (40 + i) }); }
    else if (i % 3 === 1) { await feature(page, fixture.result.id); await page.getByLabel('特征名称', { exact: true }).fill(`结果 ${i}`); await change(page, () => page.getByRole('button', { name: '应用特征名称', exact: true }).click()); }
    else { await feature(page, fixture.result.id); await change(page, () => page.getByRole('button', { name: /^(隐藏|显示)特征$/ }).click()); }
    const actual = await authority(page); if (i % 3 === 0) volume(actual.metrics[fixture.solidA.id], 600 * (40 + i)); snapshots.push(actual);
  }
  const count = await page.evaluate(() => window.__historyRequests.length);
  for (let i = 104; i >= 5; i--) { await keyboard(page, 'Control+z'); assert.deepEqual(await authority(page), snapshots[i]); }
  assert(await undo(page).isDisabled()); const oldest = await doc(page), rev = await revision(page); await page.keyboard.press('Control+z'); assert.deepEqual(await doc(page), oldest); assert.equal(await revision(page), rev);
  for (let i = 6; i <= 105; i++) { await keyboard(page, i % 2 ? 'Control+y' : 'Control+Shift+z'); assert.deepEqual(await authority(page), snapshots[i]); }
  assert(await redo(page).isDisabled()); assert.equal(await page.evaluate(() => window.__historyRequests.length), count);
  return { mixedSuccessfulCommands: 105, realDepths, oldestReachableStep: 5, exactAuthorityRestores: 200, restoreWorkerCalls: 0, passed: true };
}
async function check(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = []; await installProbe(context); page.on('pageerror', e => errors.push(e.message));
  try { await page.goto(url); await page.locator('[data-computation="ready"]').waitFor({ timeout: 15000 }); await page.locator('[data-viewport-state="ready"]').waitFor(); const fixture = await operationsFlow(page), pending = await pendingFlow(page, fixture), capacity = await capacityFlow(page, fixture); assert.deepEqual(errors, []); results.push({ mode, ...fixture, pending, capacity, browserErrors: errors, passed: true }); console.log(`PASS ${mode}: all commands, 100 mixed snapshots, 200 restores and actual late mesh cancellation`); }
  catch (cause) { await page.screenshot({ path: '.research/T-303-failure.png', fullPage: true }); console.error('Status:', await page.locator('.workspace-status').textContent()); console.error('Alerts:', await page.getByRole('alert').allTextContents()); throw cause; } finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); await check('production-root', `http://127.0.0.1:${production.httpServer.address().port}/`);
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-history-cad', emptyOutDir: true } }); subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-history-cad' }, preview: { host: '127.0.0.1', port: 0 } }); await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-303-history-browser.json', JSON.stringify({ task: 'T-303', requirement: 'REQ-009', executedAt: new Date().toISOString(), command: 'npm run check:history:browser', environment: { node: process.version, platform: process.platform, browser: browser.version(), vue: '3.5.43', three: '0.186.1' }, results, tolerances: { straightVolumeMm3: 1e-6, lengthMm: 1e-5 }, passed: true, limitations: ['Edge only; final three-browser/performance acceptance remains T-403.', 'Real file save/open remains T-401; saved fingerprint covered by Node integration.', 'Held responses contain real computed meshes, without simulated geometry.'] }, null, 2) + '\n');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
