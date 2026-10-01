import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true }); let dev, production, subpath;
const json = async (page, id) => JSON.parse(await page.locator(`[data-testid="${id}"]`).textContent());
const documentData = page => json(page, 'project-document-data');
const revision = async page => Number((await page.locator('.workspace-status').textContent()).match(/revision (\d+)/)[1]);
async function change(page, action) { const before = await revision(page); await action(); await page.waitForFunction(rev => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) > rev, before); }
async function point(page, x, y) { await page.getByLabel('下一点 X (mm)', { exact: true }).fill(String(x)); await page.getByLabel('下一点 Y (mm)', { exact: true }).fill(String(y)); await page.getByRole('button', { name: '输入此点', exact: true }).click(); }
async function draw(page, tool, points) { await page.getByRole('button', { name: tool, exact: true }).click(); for (const p of points.slice(0, -1)) await point(page, ...p); await change(page, () => point(page, ...points.at(-1))); await page.keyboard.press('Escape'); }
async function fresh(page, plane = 'XY') {
  await page.getByRole('button', { name: '新建', exact: true }).click(); const discard = page.getByRole('button', { name: '丢弃修改并新建', exact: true }); if (await discard.isVisible()) await discard.click();
  await page.getByRole('button', { name: `${plane} 平面`, exact: true }).click(); await change(page, () => page.getByRole('button', { name: '新建草图', exact: true }).click());
}
async function finishSketch(page) { const sketch = (await documentData(page)).features.find(f => f.kind === 'sketch'); await page.getByRole('button', { name: '完成草图', exact: true }).click(); await page.locator(`[data-feature-id="${sketch.id}"]`).click(); return sketch; }
async function readyPreview(page, depth = 10) {
  await page.locator('[data-extrusion-status="ready"]').waitFor(); await page.waitForFunction(d => {
    const raw = document.querySelector('[data-testid="extrusion-preview-metrics"]')?.textContent; return raw && JSON.parse(raw).depth === d;
  }, depth); await page.locator('[data-preview-objects="1"]').waitFor(); return json(page, 'extrusion-preview-metrics');
}
async function confirm(page) { await change(page, () => page.getByRole('button', { name: '确认拉伸', exact: true }).click()); await page.locator('[data-testid="committed-solid-metrics"]').waitFor({ state: 'attached' }); return json(page, 'committed-solid-metrics'); }
async function rectangle(page, plane) {
  await fresh(page, plane); await draw(page, '矩形', [[0, 0], [40, 30]]); const source = await finishSketch(page), held = await documentData(page), rev = await revision(page);
  await page.getByRole('button', { name: '拉伸', exact: true }).click(); const positive = await readyPreview(page); assert(Math.abs(positive.signedVolume - 12000) <= 1e-6); assert.deepEqual(await documentData(page), held);
  await page.getByLabel('拉伸深度 (mm)').fill('-10'); const negative = await readyPreview(page, -10); assert(negative.closed); assert(Math.abs(negative.signedVolume - 12000) <= 1e-6);
  const disposed = Number(await page.locator('.model-viewport').getAttribute('data-disposed-geometries'));
  await page.keyboard.press('Escape'); await page.getByRole('region', { name: '拉伸预览' }).waitFor({ state: 'detached' }); await page.locator('[data-preview-objects="0"]').waitFor();
  assert.equal(await revision(page), rev); assert.deepEqual(await documentData(page), held); assert(Number(await page.locator('.model-viewport').getAttribute('data-disposed-geometries')) > disposed);
  await page.locator(`[data-feature-id="${source.id}"]`).click(); await page.getByRole('button', { name: '拉伸', exact: true }).click(); await readyPreview(page);
  await page.getByLabel('拉伸深度 (mm)').fill('0'); await page.locator('[data-extrusion-status="error"]').waitFor(); assert(await page.getByRole('button', { name: '确认拉伸', exact: true }).isDisabled());
  assert.equal(await revision(page), rev); assert.deepEqual(await documentData(page), held);
  await page.getByLabel('拉伸深度 (mm)').fill('10'); await readyPreview(page); const committed = await confirm(page), saved = await documentData(page), feature = saved.features.find(f => f.kind === 'extrude');
  assert.equal(await revision(page), rev + 1); assert.equal(feature.depth, 10); assert.equal(feature.sketchId, source.id); assert.equal(feature.region.outerEntityIds.length, 4); assert(Math.abs(committed.signedVolume-12000)<=1e-6);
  const expectedBounds = plane === 'XY' ? { min: [0, 0, 0], max: [40, 30, 10] } : plane === 'XZ' ? { min: [0, -10, 0], max: [40, 0, 30] } : { min: [0, 0, 0], max: [10, 40, 30] };
  for (const end of ['min', 'max']) committed.bounds[end].forEach((v, i) => assert(Math.abs(v - expectedBounds[end][i]) <= 1e-6));
  await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); assert.deepEqual(await documentData(page), held);
  await change(page, () => page.getByRole('button', { name: '重做', exact: true }).click()); assert.deepEqual(await documentData(page), saved);
  await page.locator(`[data-feature-id="${feature.id}"]`).click(); assert.deepEqual(await json(page, 'committed-solid-metrics'), committed);
  await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); await page.locator(`[data-feature-id="${source.id}"]`).click();
  await page.getByRole('button', { name: '拉伸', exact: true }).click(); await readyPreview(page); await page.getByLabel('拉伸深度 (mm)').fill('-10'); await readyPreview(page, -10);
  const final = await confirm(page); assert(final.closed && final.signedVolume > 0 && final.windingErrors === 0); assert.equal((await documentData(page)).features.at(-1).depth, -10);
  return { plane, source, positive, negative, committed, expectedBounds, finalNegative: final, definition: feature, cancelDocumentRevisionUnchanged: true, disposedPreviewGeometry: true, zeroRefused: true, exactUndoRedo: true, oneCommitRevision: true, passed: true };
}
async function otherRegions(page) {
  const cases = [];
  for (const kind of ['hole', 'circle', 'half']) {
    await fresh(page);
    if (kind === 'hole') { await draw(page, '矩形', [[0, 0], [40, 30]]); await draw(page, '矩形', [[15, 10], [25, 20]]); }
    if (kind === 'circle') await draw(page, '圆', [[0, 0], [10, 0]]);
    if (kind === 'half') { await draw(page, '圆弧', [[-10, 0], [0, 10], [10, 0]]); await draw(page, '线段', [[10, 0], [-10, 0]]); }
    const source = await finishSketch(page); await page.getByRole('button', { name: '拉伸', exact: true }).click(); await readyPreview(page); const actual = await confirm(page), definition = (await documentData(page)).features.at(-1);
    const expectedVolumeMm3 = kind === 'hole' ? 11000 : kind === 'circle' ? 1000 * Math.PI : 500 * Math.PI;
    assert(Math.abs(actual.signedVolume - expectedVolumeMm3) / expectedVolumeMm3 <= (kind === 'hole' ? 1e-8 : 0.01)); assert(actual.closed); if (kind === 'hole') assert.equal(definition.region.holeEntityIds.length, 1);
    cases.push({ kind, source, definition, actual, expectedVolumeMm3, passed: true });
  }
  await fresh(page); await draw(page, '矩形', [[0, 0], [40, 30]]); await draw(page, '矩形', [[50, 0], [70, 20]]); const source = await finishSketch(page), held = await documentData(page);
  await page.getByRole('button', { name: '拉伸', exact: true }).click(); await page.locator('[data-extrusion-status="choose"]').waitFor(); assert(await page.getByRole('button', { name: '确认拉伸', exact: true }).isDisabled());
  assert.equal(await page.locator('[data-testid="extrusion-preview-metrics"]').count(), 0); assert.deepEqual(await documentData(page), held);
  const option = await page.getByLabel('拉伸区域', { exact: true }).locator('option').filter({ hasText: '1200.000' }).getAttribute('value'); await page.getByLabel('拉伸区域', { exact: true }).selectOption(option);
  await readyPreview(page); const actual = await confirm(page); assert(Math.abs(actual.signedVolume - 12000) <= 1e-6);
  cases.push({ kind: 'explicit-multiple-regions', source, noAutomaticChoice: true, actual, definition: (await documentData(page)).features.at(-1), passed: true }); return cases;
}
async function refusedRegions(page) {
  const cases = [];
  for (const kind of ['open', 'self-intersection', 'tangent-hole', 'intersecting-holes']) {
    await fresh(page);
    if (kind === 'open') await draw(page, '线段', [[0, 0], [20, 0]]);
    if (kind === 'self-intersection') for (const points of [[[0, 0], [20, 20]], [[20, 20], [0, 20]], [[0, 20], [20, 0]], [[20, 0], [0, 0]]]) await draw(page, '线段', points);
    if (kind === 'tangent-hole') { await draw(page, '矩形', [[0, 0], [40, 30]]); await draw(page, '圆', [[10, 5], [15, 5]]); }
    if (kind === 'intersecting-holes') { await draw(page, '矩形', [[0, 0], [40, 30]]); await draw(page, '圆', [[12, 15], [14, 15]]); await draw(page, '圆', [[15, 15], [17, 15]]); }
    const source = await finishSketch(page), held = await documentData(page), rev = await revision(page); await page.getByRole('button', { name: '拉伸', exact: true }).click();
    const alert = page.getByRole('alert'); await alert.waitFor(); const message = await alert.textContent(); assert.match(message, /未闭合|交叉|相切|连接|重叠/);
    assert.equal(await page.getByRole('region', { name: '拉伸预览' }).count(), 0); assert.equal(await revision(page), rev); assert.deepEqual(await documentData(page), held); cases.push({ kind, source, message, unchanged: true, passed: true });
  }
  return cases;
}
async function check(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = [], workers = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('worker', w => workers.push(w.url()));
  try {
    await page.goto(url); await page.locator('[data-computation="ready"]').waitFor({ timeout: 15000 }); await page.locator('[data-viewport-state="ready"]').waitFor();
    const planes = []; for (const plane of ['XY', 'XZ', 'YZ']) planes.push(await rectangle(page, plane));
    const regions = await otherRegions(page), refusals = await refusedRegions(page); assert.equal(errors.length, 0, errors.join('\n'));
    await fresh(page); await draw(page, '矩形', [[0, 0], [40, 30]]); await draw(page, '矩形', [[15, 10], [25, 20]]); await finishSketch(page); await page.getByRole('button', { name: '拉伸', exact: true }).click(); await readyPreview(page); await page.getByRole('button', { name: '适应视图', exact: true }).click();
    await page.screenshot({ path: `.research/T-202C2b-${mode.replaceAll('/', '')}.png`, fullPage: true });
    results.push({ mode, planes, regions, refusals, workers, browserErrors: errors, passed: true });
  } catch (cause) { await page.screenshot({ path: '.research/T-202C2b-failure.png', fullPage: true }); console.error(await page.getByRole('alert').allTextContents()); throw cause; }
  finally { await context.close(); }
}
async function coldCancel(url, action) {
  const context = await browser.newContext(), page = await context.newPage(); let held, captured; const capture = new Promise(resolve => captured = resolve);
  try {
    await page.goto(url); await page.locator('[data-computation="ready"]').waitFor(); await page.locator('[data-viewport-state="ready"]').waitFor(); await fresh(page); await draw(page, '矩形', [[0, 0], [40, 30]]); const sketch = await finishSketch(page), doc = await documentData(page), rev = await revision(page);
    if (action === 'commit') { await page.getByRole('button', { name: '拉伸', exact: true }).click(); await readyPreview(page); }
    await context.route('**/assets/solid.worker-*.js', route => { held = route; captured(); });
    await page.getByRole('button', { name: action === 'commit' ? '确认拉伸' : '拉伸', exact: true }).click(); await Promise.race([capture, new Promise((_, reject) => setTimeout(() => reject(Error('No cold solid Worker request')), 5000))]);
    if (action === 'new') { await page.getByRole('button', { name: '新建', exact: true }).click(); await page.getByRole('button', { name: '丢弃修改并新建', exact: true }).click(); }
    else await page.keyboard.press('Escape');
    await held.abort(); await context.unroute('**/assets/solid.worker-*.js'); await page.locator('[data-preview-objects="0"]').waitFor();
    if (action === 'new') assert.equal((await documentData(page)).features.length, 0);
    else { assert.deepEqual(await documentData(page), doc); assert.equal(await revision(page), rev); await page.locator(`[data-feature-id="${sketch.id}"]`).click(); await page.getByRole('button', { name: '拉伸', exact: true }).click(); await readyPreview(page); const actual = await confirm(page); assert(Math.abs(actual.signedVolume-12000)<=1e-6); }
    return { action, heldRealWorkerLoad: true, cancelledWithoutHistoryOrOldMesh: true, recovered: action !== 'new', passed: true };
  } finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); const url = `http://127.0.0.1:${production.httpServer.address().port}/`; await check('production-root', url);
  const cold = []; for (const action of ['preview', 'commit', 'new']) cold.push(await coldCancel(url, action));
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-extrusion-ui-cad', emptyOutDir: true } }); subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-extrusion-ui-cad' }, preview: { host: '127.0.0.1', port: 0 } }); await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-202C2b-ui-browser.json', JSON.stringify({ task: 'T-202C2b', executedAt: new Date().toISOString(), command: 'npm run check:extrusion-ui:browser', environment: { node: process.version, browser: browser.version() }, results, cold, passed: true,
    limitations: ['Only Edge measured; final three-browser/performance acceptance later.', 'Full recomputation for sketch/extrude; Boolean/affected-branch optimization and file workflow remain later.'] }, null, 2) + '\n');
  console.log('PASS: three-entry actual extrusion region/depth/preview/dispose/cancel/commit/history, three planes ±depth, holes/circle/arc/multiple regions, invalid contours/zero, cold preview/commit/new cancellation.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
