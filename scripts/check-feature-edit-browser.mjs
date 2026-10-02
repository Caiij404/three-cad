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
const select = (page, id) => page.locator(`[data-feature-id="${id}"]`).click();
async function change(page, action) { const before = await revision(page); await action(); await page.waitForFunction(rev => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) === rev + 1, before); }
async function point(page, x, y) { await page.getByLabel('下一点 X (mm)', { exact: true }).fill(String(x)); await page.getByLabel('下一点 Y (mm)', { exact: true }).fill(String(y)); await page.getByRole('button', { name: '输入此点', exact: true }).click(); }
async function fresh(page) { await page.getByRole('button', { name: '新建', exact: true }).click(); const discard = page.getByRole('button', { name: '丢弃修改并新建', exact: true }); if (await discard.isVisible()) await discard.click(); }
async function addConstraint(page, kind, id, value) {
  const details = page.locator('.sketch-objects'); if (await details.getAttribute('open') === null) await details.locator('summary').click(); const s = await sketch(page);
  await page.locator(`[${s.points.some(p => p.id === id) ? 'data-point-select-id' : 'data-entity-id'}="${id}"]`).click(); await page.getByRole('button', { name: '约束', exact: true }).click(); await page.getByLabel('约束类型', { exact: true }).selectOption(kind);
  if (value !== undefined) await page.getByLabel('新约束数值 (mm)', { exact: true }).fill(String(value)); await change(page, () => page.getByRole('button', { name: '添加约束', exact: true }).click()); return (await sketch(page)).constraints.at(-1).id;
}
async function rectangle(page, x, y, width, height) {
  const count = (await sketch(page)).entities.length; await page.getByRole('button', { name: '矩形', exact: true }).click(); await point(page, x, y); await change(page, () => point(page, x + width, y + height)); await page.keyboard.press('Escape'); const s = await sketch(page), start = s.entities[count].startPointId;
  if (!s.constraints.some(c => c.kind === 'fixed' && c.refs[0].pointId === start)) await addConstraint(page, 'fixed', start);
  const widthId = await addConstraint(page, 'length', s.entities[count].id, width); await addConstraint(page, 'length', s.entities[count + 1].id, height); return widthId;
}
async function startSketch(page, plane = 'XY') { await page.getByRole('button', { name: `${plane} 平面`, exact: true }).click(); await change(page, () => page.getByRole('button', { name: '新建草图', exact: true }).click()); }
async function finish(page) { const s = await sketch(page); await page.getByRole('button', { name: '完成草图', exact: true }).click(); await select(page, s.id); return s; }
async function extrude(page, depth = 10, region) {
  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  if (region) await page.getByLabel('拉伸区域', { exact: true }).selectOption({ label: region });
  await page.locator('[data-extrusion-status="ready"]').waitFor(); await page.getByLabel('拉伸深度 (mm)', { exact: true }).fill(String(depth));
  await page.waitForFunction(d => { const raw = document.querySelector('[data-testid="extrusion-preview-metrics"]')?.textContent; return raw && JSON.parse(raw).depth === d; }, depth);
  await change(page, () => page.getByRole('button', { name: '确认拉伸', exact: true }).click()); return (await doc(page)).features.at(-1);
}
async function box(page, plane, x, y, width, height, depth = 10) { await startSketch(page, plane); const widthId = await rectangle(page, x, y, width, height), source = await finish(page), solid = await extrude(page, depth); return { source, solid, widthId }; }
async function boolean(page, a, b, operation) {
  await select(page, a); await page.keyboard.down('Control'); await select(page, b); await page.keyboard.up('Control'); await page.getByRole('button', { name: '布尔', exact: true }).click(); await page.getByLabel('布尔操作', { exact: true }).selectOption(operation);
  await change(page, () => page.getByRole('button', { name: '确认布尔', exact: true }).click()); await page.getByRole('region', { name: '布尔运算', exact: true }).waitFor({ state: 'detached' }); return (await doc(page)).features.at(-1);
}
async function metrics(page, id) { await select(page, id); return json(page, 'committed-solid-metrics'); }
function volume(actual, expected) { assert(actual.closed && actual.windingErrors === 0); assert(Math.abs(actual.signedVolume - expected) <= 1e-6, `${actual.signedVolume} != ${expected}`); }
async function allMetrics(page) { const output = {}; for (const f of (await doc(page)).features.filter(f => f.kind !== 'sketch')) output[f.id] = await metrics(page, f.id); return output; }
async function authority(page) { return { document: await doc(page), metrics: await allMetrics(page), revision: await revision(page), canUndo: !await page.getByRole('button', { name: '撤销', exact: true }).isDisabled(), canRedo: !await page.getByRole('button', { name: '重做', exact: true }).isDisabled() }; }
async function exactHistory(page, before, after) {
  await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); assert.deepEqual(await doc(page), before.document); assert.deepEqual(await allMetrics(page), before.metrics);
  await change(page, () => page.getByRole('button', { name: '重做', exact: true }).click()); assert.deepEqual(await doc(page), after.document); assert.deepEqual(await allMetrics(page), after.metrics);
}
const traceStart = page => page.evaluate(() => window.__geometryRequests.length);
const traceSince = (page, start) => page.evaluate(i => window.__geometryRequests.slice(i), start);
async function editDepth(page, id, value, succeeds = true) { await select(page, id); await page.getByLabel('现有拉伸深度 (mm)', { exact: true }).fill(String(value)); const action = () => page.getByRole('button', { name: '应用拉伸参数', exact: true }).click(); if (succeeds) await change(page, action); else { await action(); await page.locator('[data-extrude-edit-status="error"]').waitFor(); } }
async function widthAndDepth(page, plane) {
  await fresh(page); const a = await box(page, plane, 0, 0, 40, 30), b = await box(page, plane, 10, 0, 20, 30), result = await boolean(page, a.solid.id, b.solid.id, 'subtract');
  const initial = await authority(page); volume(initial.metrics[a.solid.id], 12000); volume(initial.metrics[result.id], 6000); const start = await traceStart(page);
  await select(page, a.source.id); await page.getByRole('button', { name: '编辑草图', exact: true }).click(); const row = page.locator(`[data-constraint-id="${a.widthId}"]`); await row.getByLabel('约束数值 (mm)', { exact: true }).fill('60'); await change(page, () => row.getByRole('button', { name: '应用数值', exact: true }).click()); await finish(page);
  const wider = await authority(page), widthRequests = await traceSince(page, start); volume(wider.metrics[a.solid.id], 18000); volume(wider.metrics[result.id], 12000); assert.deepEqual(wider.document.features.filter(f => f.kind !== 'sketch'), initial.document.features.filter(f => f.kind !== 'sketch')); assert.deepEqual(wider.metrics[b.solid.id], initial.metrics[b.solid.id]);
  assert.deepEqual(widthRequests, [{ kind: 'sketch-solve', sketchId: a.source.id }, { kind: 'sketch-extrusion', sketchId: a.source.id }, { kind: 'mesh-boolean', operation: 'subtract' }]); await exactHistory(page, initial, wider);
  const beforeDepth = await authority(page), depthStart = await traceStart(page); await editDepth(page, a.solid.id, 20); const deeper = await authority(page), depthRequests = await traceSince(page, depthStart); volume(deeper.metrics[a.solid.id], 36000); volume(deeper.metrics[result.id], 30000);
  assert.equal(deeper.document.features.find(f => f.id === a.solid.id).depth, 20); assert.deepEqual(depthRequests, [{ kind: 'sketch-extrusion', sketchId: a.source.id }, { kind: 'mesh-boolean', operation: 'subtract' }]); await exactHistory(page, beforeDepth, deeper);
  for (const value of [0, '', 'not-a-number']) { const before = await authority(page); await editDepth(page, a.solid.id, value, false); assert.deepEqual(await authority(page), before); }
  const unchanged = await authority(page); await select(page, a.solid.id); await page.getByLabel('现有拉伸深度 (mm)', { exact: true }).fill('77'); await page.getByRole('button', { name: '取消修改', exact: true }).click(); assert.equal(await page.getByLabel('现有拉伸深度 (mm)', { exact: true }).inputValue(), '20'); assert.deepEqual(await authority(page), unchanged);
  const negativeStart = await traceStart(page); await editDepth(page, a.solid.id, -10); const negative = await authority(page); volume(negative.metrics[a.solid.id], 18000); volume(negative.metrics[result.id], 18000); await exactHistory(page, deeper, negative);
  return { plane, initial, wider, deeper, negative, widthRequests, depthRequests, negativeRequests: await traceSince(page, negativeStart), stableIds: true, unrelatedBranchExact: true, zeroBlankNaNRejectedWithoutHistory: true, localDraftCancelNoCommand: true, exactHistory: true, sources: { a, b, result }, passed: true };
}
async function cascadeAndMetadata(page, fixture, mode) {
  const { a, b, result } = fixture.sources, start = await traceStart(page); await select(page, a.solid.id); await page.getByLabel('特征名称', { exact: true }).fill('可编辑来源 A'); await change(page, () => page.getByRole('button', { name: '应用特征名称', exact: true }).click());
  assert.match(await page.locator(`[data-feature-dependency-id="${result.id}"]`).textContent(), /可编辑来源 A/); await change(page, () => page.getByRole('button', { name: '显示特征', exact: true }).click()); await change(page, () => page.getByRole('button', { name: '隐藏特征', exact: true }).click()); assert.deepEqual(await traceSince(page, start), []);
  assert.match(await page.locator(`[data-feature-dependency-id="${a.solid.id}"]`).textContent(), new RegExp(a.source.name)); const before = await authority(page), dialog = page.getByRole('dialog', { name: '删除来源会影响后代', exact: true });
  const request = async () => { await select(page, a.source.id); await page.getByRole('button', { name: '删除特征', exact: true }).click(); await dialog.waitFor(); assert.deepEqual(await dialog.locator('[data-delete-affected-id]').evaluateAll(nodes => nodes.map(n => n.dataset.deleteAffectedId)), [a.solid.id, result.id]); assert.deepEqual(await doc(page), before.document); assert.equal(await revision(page), before.revision); };
  await request(); assert.equal(await page.evaluate(() => document.activeElement?.textContent), '取消删除'); await page.keyboard.press('Enter'); await dialog.waitFor({ state: 'detached' }); assert.deepEqual(await authority(page), before);
  await request(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); assert.deepEqual(await authority(page), before);
  await request(); await dialog.getByRole('button', { name: '取消删除', exact: true }).click(); await dialog.waitFor({ state: 'detached' }); assert.deepEqual(await authority(page), before);
  await request(); await page.screenshot({ path: `.research/T-302B-cascade-${mode.replaceAll('/', '')}.png`, fullPage: true }); const deletionStart = await traceStart(page); await change(page, () => dialog.getByRole('button', { name: '级联删除来源及后代', exact: true }).click()); await dialog.waitFor({ state: 'detached' }); const after = await authority(page);
  assert.deepEqual(after.document.features.map(f => f.id), [b.source.id, b.solid.id]); assert.deepEqual(after.document.features, before.document.features.filter(f => [b.source.id, b.solid.id].includes(f.id))); assert.deepEqual(after.metrics, { [b.solid.id]: before.metrics[b.solid.id] }); assert.deepEqual(await traceSince(page, deletionStart), []); await exactHistory(page, before, after);
  return { before, after, affectedIds: [a.solid.id, result.id], enterDefaultsToCancel: true, escapeAndButtonNoCommand: true, explicitCascadeOneRevision: true, unrelatedGeometryExact: true, actualMetadataAndCascadeWorkerCalls: 0, exactHistory: true, passed: true };
}
async function regionEdit(page, mode) {
  await fresh(page); await startSketch(page); await rectangle(page, 0, 0, 20, 20); await rectangle(page, 40, 0, 10, 10); const source = await finish(page);
  await page.getByRole('button', { name: '拉伸', exact: true }).click(); const options = await page.getByLabel('拉伸区域', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(n => ({ value: n.value, text: n.textContent }))); const first = options.find(o => o.text.includes('400.000')); assert(first); await page.getByLabel('拉伸区域', { exact: true }).selectOption(first.value); await page.locator('[data-extrusion-status="ready"]').waitFor(); await change(page, () => page.getByRole('button', { name: '确认拉伸', exact: true }).click()); const solid = (await doc(page)).features.at(-1), before = await authority(page); volume(before.metrics[solid.id], 4000);
  await select(page, solid.id); const choices = await page.getByLabel('现有拉伸区域', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(n => ({ value: n.value, text: n.textContent }))); const second = choices.find(o => o.text.includes('100.000')); assert(second); const start = await traceStart(page); await page.getByLabel('现有拉伸区域', { exact: true }).selectOption(second.value); await change(page, () => page.getByRole('button', { name: '应用拉伸参数', exact: true }).click()); const after = await authority(page); volume(after.metrics[solid.id], 1000); assert.equal(after.document.features.at(-1).id, solid.id); assert.equal(after.document.features.at(-1).sketchId, source.id); assert.notDeepEqual(after.document.features.at(-1).region, solid.region); assert.deepEqual(await traceSince(page, start), [{ kind: 'sketch-extrusion', sketchId: source.id }]); await exactHistory(page, before, after); await select(page, solid.id); await page.screenshot({ path: `.research/T-302B-parameters-${mode.replaceAll('/', '')}.png`, fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 }); await page.getByRole('button', { name: '应用拉伸参数', exact: true }).scrollIntoViewIfNeeded();
  const narrowLayout = await page.getByRole('region', { name: '编辑拉伸参数', exact: true }).evaluate(region => { const panel = region.closest('.property-panel').getBoundingClientRect(); return [...region.querySelectorAll('select,input,button')].map(node => { const r = node.getBoundingClientRect(); return { text: node.getAttribute('aria-label') ?? node.textContent, left: r.left, right: r.right, withinPanel: r.left >= panel.left && r.right <= panel.right }; }); }); assert(narrowLayout.every(r => r.withinPanel)); await page.screenshot({ path: `.research/T-302B-parameters-1024-${mode.replaceAll('/', '')}.png`, fullPage: true }); await page.setViewportSize({ width: 1280, height: 900 });
  return { before, after, stableFeatureAndSourceIds: true, actualWorkerCalls: 1, exactRegionHistory: true, narrowLayout, passed: true };
}
async function descendantFailure(page) {
  await fresh(page); const a = await box(page, 'XY', 0, 0, 20, 20), b = await box(page, 'XY', 10, 0, 20, 20), intersection = await boolean(page, a.solid.id, b.solid.id, 'intersect'), c = await box(page, 'XY', 50, 0, 10, 10), result = await boolean(page, intersection.id, c.solid.id, 'union');
  const before = await authority(page), start = await traceStart(page); await editDepth(page, a.solid.id, -10, false); const message = await page.getByRole('region', { name: '编辑拉伸参数', exact: true }).getByRole('alert').textContent(); assert.match(message, /empty|空|EMPTY/); assert.deepEqual(await authority(page), before); const requests = await traceSince(page, start); assert.deepEqual(requests, [{ kind: 'sketch-extrusion', sketchId: a.source.id }, { kind: 'mesh-boolean', operation: 'intersect' }, { kind: 'mesh-boolean', operation: 'union' }]);
  await editDepth(page, a.solid.id, 20); const recovered = await authority(page); volume(recovered.metrics[result.id], 3000); await exactHistory(page, before, recovered);
  return { before, message, requests, recovered, lateDescendantFailureDocumentMeshesRevisionHistoryUnchanged: true, recoveryPassed: true, passed: true };
}
async function installProbe(context) {
  await context.addInitScript(() => {
    window.__geometryRequests = []; const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      heldIds = new Set();
      constructor(url, options) { super(url, options); this.addEventListener('message', event => { if (!event.data.ok || !this.heldIds.has(event.data.requestId)) return; event.stopImmediatePropagation(); const data = event.data; window.__heldEditReply = { output: data.output, release: () => { this.heldIds.delete(data.requestId); this.dispatchEvent(new MessageEvent('message', { data })); } }; }, true); }
      postMessage(data, ...args) { const input = data.input; if (input && (input.sketch || input.kind === 'mesh-boolean')) window.__geometryRequests.push({ kind: input.kind ?? 'sketch-solve', ...(input.sketch ? { sketchId: input.sketch.id } : {}), ...(input.operation ? { operation: input.operation } : {}) }); if (input?.kind === 'sketch-extrusion' && window.__holdEdit) this.heldIds.add(data.requestId); super.postMessage(data, ...args); }
    };
  });
}
async function pendingCancel(url, action) {
  const context = await browser.newContext(), page = await context.newPage(); await installProbe(context);
  try {
    await page.goto(url); await page.locator('[data-computation="ready"]').waitFor(); await page.locator('[data-viewport-state="ready"]').waitFor(); const a = await box(page, 'XY', 0, 0, 20, 20), before = await authority(page); await select(page, a.solid.id); await page.getByLabel('现有拉伸深度 (mm)', { exact: true }).fill('20'); await page.evaluate(() => { window.__holdEdit = true; }); await page.getByRole('button', { name: '应用拉伸参数', exact: true }).click(); await page.waitForFunction(() => !!window.__heldEditReply); const actual = meshMetrics(await page.evaluate(() => window.__heldEditReply.output)); volume(actual, 8000); assert(await page.getByRole('button', { name: '撤销', exact: true }).isDisabled()); assert.deepEqual(await doc(page), before.document);
    if (action === 'button') await page.getByRole('button', { name: '取消修改', exact: true }).click(); else await page.keyboard.press('Escape'); await page.getByRole('region', { name: '编辑拉伸参数', exact: true }).waitFor({ state: 'detached' }); await page.evaluate(() => { window.__holdEdit = false; window.__heldEditReply.release(); }); assert.deepEqual(await authority(page), before);
    await editDepth(page, a.solid.id, 20); const recovered = await authority(page); volume(recovered.metrics[a.solid.id], 8000); return { action, actualComputedMeshBeforeHoldingReply: actual, lateReplyDiscarded: true, documentMeshesRevisionHistoryUnchanged: true, recovered, passed: true };
  } finally { await context.close(); }
}
async function check(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = []; await installProbe(context); page.on('pageerror', e => errors.push(e.message));
  try { await page.goto(url); await page.locator('[data-computation="ready"]').waitFor({ timeout: 15000 }); await page.locator('[data-viewport-state="ready"]').waitFor(); const planes = []; for (const plane of ['XY', 'XZ', 'YZ']) { const fixture = await widthAndDepth(page, plane); planes.push({ ...fixture, cascade: await cascadeAndMetadata(page, fixture, `${mode}-${plane}`) }); } const region = await regionEdit(page, mode), failure = await descendantFailure(page); assert.deepEqual(errors, []); results.push({ mode, planes, region, failure, browserErrors: errors, passed: true }); }
  catch (cause) { await page.screenshot({ path: '.research/T-302B-failure.png', fullPage: true }); console.error('Alerts:', await page.getByRole('alert').allTextContents()); console.error('Status:', await page.locator('.workspace-status').textContent()); throw cause; } finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); const url = `http://127.0.0.1:${production.httpServer.address().port}/`; await check('production-root', url); const cancellations = []; for (const action of ['escape', 'button']) cancellations.push(await pendingCancel(url, action));
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-feature-edit-cad', emptyOutDir: true } }); subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-feature-edit-cad' }, preview: { host: '127.0.0.1', port: 0 } }); await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-302B-feature-edit-browser.json', JSON.stringify({ task: 'T-302B', executedAt: new Date().toISOString(), command: 'npm run check:feature-edit:browser', environment: { node: process.version, platform: process.platform, browser: browser.version(), vue: '3.5.43', three: '0.186.1' }, results, cancellations, tolerances: { straightVolumeMm3: 1e-6 }, passed: true, limitations: ['Only Edge; final three-browser/performance acceptance later.', 'No file save/open: E2E-02 step 6 roundtrip remains T-401.', 'Holding delays actual computed Worker mesh; no simulated geometry.'] }, null, 2) + '\n'); console.log('PASS: three entries × three planes width40→60, existing depth±/region edits, selective calls, explicit cascade/default cancel/metadata, exact history, late descendant failure and actual pending Worker cancellation.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
