import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true }); let dev, production, subpath;
const json = async (page, id) => JSON.parse(await page.locator(`[data-testid="${id}"]`).textContent());
const documentData = page => json(page, 'project-document-data');
const sketch = page => json(page, 'active-sketch-data');
const diagnostic = page => json(page, 'active-sketch-diagnostics');
const revision = async page => Number((await page.locator('.workspace-status').textContent()).match(/revision (\d+)/)[1]);
async function change(page, action) { const before = await revision(page); await action(); await page.waitForFunction(rev => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) === rev + 1, before); }
async function point(page, x, y) { await page.getByLabel('下一点 X (mm)', { exact: true }).fill(String(x)); await page.getByLabel('下一点 Y (mm)', { exact: true }).fill(String(y)); await page.getByRole('button', { name: '输入此点', exact: true }).click(); }
async function draw(page, tool, points) { await page.getByRole('button', { name: tool, exact: true }).click(); for (const p of points.slice(0, -1)) await point(page, ...p); await change(page, () => point(page, ...points.at(-1))); await page.keyboard.press('Escape'); }
async function fresh(page, plane = 'XY') {
  await page.getByRole('button', { name: '新建', exact: true }).click(); const discard = page.getByRole('button', { name: '丢弃修改并新建', exact: true }); if (await discard.isVisible()) await discard.click();
  await page.getByRole('button', { name: `${plane} 平面`, exact: true }).click(); await change(page, () => page.getByRole('button', { name: '新建草图', exact: true }).click());
}
async function select(page, ids) {
  const details = page.locator('.sketch-objects'); if (await details.getAttribute('open') === null) await details.locator('summary').click();
  const s = await sketch(page);
  for (let i = 0; i < ids.length; i++) { if (i) await page.keyboard.down('Control'); await page.locator(`[${s.points.some(p => p.id === ids[i]) ? 'data-point-select-id' : 'data-entity-id'}="${ids[i]}"]`).click(); if (i) await page.keyboard.up('Control'); }
}
async function addConstraint(page, kind, ids, value, succeeds = true) {
  await select(page, ids); await page.getByRole('button', { name: '约束', exact: true }).click(); await page.getByLabel('约束类型', { exact: true }).selectOption(kind);
  if (value !== undefined) await page.getByLabel('新约束数值 (mm)', { exact: true }).fill(String(value));
  const click = () => page.getByRole('button', { name: '添加约束', exact: true }).click();
  if (!succeeds) { await click(); return; } await change(page, click); return (await sketch(page)).constraints.at(-1).id;
}
async function editConstraint(page, id, value, fixed = false, succeeds = true) {
  const row = page.locator(`[data-constraint-id="${id}"]`); await row.getByLabel(fixed ? '固定 X (mm)' : '约束数值 (mm)', { exact: true }).fill(String(value));
  const click = () => row.getByRole('button', { name: fixed ? '应用坐标' : '应用数值', exact: true }).click(); if (succeeds) await change(page, click); else await click();
}
async function finish(page) { const source = await sketch(page); await page.getByRole('button', { name: '完成草图', exact: true }).click(); await page.locator(`[data-feature-id="${source.id}"]`).click(); return source; }
async function editSource(page, sourceId) { await page.locator(`[data-feature-id="${sourceId}"]`).click(); await page.getByRole('button', { name: '编辑草图', exact: true }).click(); await page.locator('[data-testid="active-sketch-data"]').waitFor({ state: 'attached' }); }
async function metrics(page, solidId) { await page.locator(`[data-feature-id="${solidId}"]`).click(); return json(page, 'committed-solid-metrics'); }
function volume(actual, expected, curve = false) { assert(actual.closed && actual.signedVolume > 0 && actual.windingErrors === 0); assert(Math.abs(actual.signedVolume - expected) <= (curve ? expected * 0.01 : 1e-6)); }
async function extrude(page, depth = 10) {
  await page.getByRole('button', { name: '拉伸', exact: true }).click(); await page.locator('[data-extrusion-status="ready"]').waitFor();
  if (depth !== 10) { await page.getByLabel('拉伸深度 (mm)').fill(String(depth)); await page.waitForFunction(d => { const raw = document.querySelector('[data-testid="extrusion-preview-metrics"]')?.textContent; return raw && JSON.parse(raw).depth === d; }, depth); }
  await change(page, () => page.getByRole('button', { name: '确认拉伸', exact: true }).click()); await page.locator('[data-testid="committed-solid-metrics"]').waitFor({ state: 'attached' });
  return (await documentData(page)).features.at(-1);
}
async function exactUndoRedo(page, before, after, solidId, first, changed) {
  await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); assert.deepEqual(await documentData(page), before); assert.deepEqual(await metrics(page, solidId), first);
  await change(page, () => page.getByRole('button', { name: '重做', exact: true }).click()); assert.deepEqual(await documentData(page), after); assert.deepEqual(await metrics(page, solidId), changed);
}
async function rejection(page, sourceId, solid, expectedState, action) {
  await editSource(page, sourceId); const before = await documentData(page), diag = await diagnostic(page), rev = await revision(page), redoDisabled = await page.getByRole('button', { name: '重做', exact: true }).isDisabled();
  await action(); const alert = page.locator(`[data-attempt-state="${expectedState}"]`); await alert.waitFor(); const message = await alert.textContent();
  assert.deepEqual(await documentData(page), before); assert.deepEqual(await diagnostic(page), diag); assert.equal(await revision(page), rev); assert.equal(await page.getByRole('button', { name: '重做', exact: true }).isDisabled(), redoDisabled);
  await finish(page); const actual = await metrics(page, solid.id); return { message, actual, documentDiagnosticsRevisionRedoUnchanged: true };
}
async function rectangle(page, plane, withHole = false) {
  await fresh(page, plane); await draw(page, '矩形', [[0, 0], [40, 30]]); let s = await sketch(page);
  const widthId = await addConstraint(page, 'length', [s.entities[0].id], 40), heightId = await addConstraint(page, 'length', [s.entities[1].id], 30); let holeWidthId;
  if (withHole) {
    await draw(page, '矩形', [[15, 10], [25, 20]]); s = await sketch(page);
    await addConstraint(page, 'fixed', [s.entities[4].startPointId]); holeWidthId = await addConstraint(page, 'length', [s.entities[4].id], 10); await addConstraint(page, 'length', [s.entities[5].id], 10);
  }
  s = await finish(page); const solid = await extrude(page, plane === 'XZ' ? -10 : 10), before = await documentData(page), first = await metrics(page, solid.id); volume(first, withHole ? 11000 : 12000);
  await editSource(page, s.id); await editConstraint(page, widthId, 60); assert.equal((await diagnostic(page)).dof, 0); const changedDiag = await diagnostic(page);
  await page.locator(`[data-dimension-id="${widthId}"]`).filter({ hasText: 'L 60.000 mm' }).waitFor(); await finish(page);
  const wider = await documentData(page), widerMetrics = await metrics(page, solid.id); volume(widerMetrics, withHole ? 17000 : 18000); assert.deepEqual(wider.features.at(-1), solid); await exactUndoRedo(page, before, wider, solid.id, first, widerMetrics);
  let final = wider, finalMetrics = widerMetrics;
  if (withHole) {
    await editSource(page, s.id); assert.deepEqual(await diagnostic(page), changedDiag); await editConstraint(page, holeWidthId, 20); await finish(page);
    final = await documentData(page); finalMetrics = await metrics(page, solid.id); volume(finalMetrics, 16000); assert.deepEqual(final.features.at(-1), solid); await exactUndoRedo(page, wider, final, solid.id, widerMetrics, finalMetrics);
  }
  const failure = await rejection(page, s.id, solid, withHole ? 'validation-failed' : 'inconsistent', async () => {
    if (withHole) await editConstraint(page, holeWidthId, 60, false, false); else await addConstraint(page, 'length', [s.entities[0].id], 50, false);
  }); assert.deepEqual(failure.actual, finalMetrics); if (withHole) assert.match(failure.message, /交叉|接触/); else assert.match(failure.message, /冲突/);
  await exactUndoRedo(page, withHole ? wider : before, final, solid.id, withHole ? widerMetrics : first, finalMetrics);
  return { kind: withHole ? 'hole' : 'rectangle', plane, depth: solid.depth, widthId, heightId, holeWidthId, sourceDefinition: solid, initialDocument: before, finalDocument: final, volumes: [first, widerMetrics, ...(withHole ? [finalMetrics] : [])], failure, oneRevisionPerParameterEdit: true, exactGeometryConstraintUndoRedo: true, passed: true };
}
async function curve(page, kind) {
  await fresh(page); let parameterId, fixed;
  if (kind === 'circle') { await draw(page, '圆', [[0, 0], [10, 0]]); const s = await sketch(page); parameterId = await addConstraint(page, 'radius', [s.entities[0].id], 10); fixed = false; }
  else {
    await draw(page, '圆弧', [[-10, 0], [0, 10], [10, 0]]); await draw(page, '线段', [[10, 0], [-10, 0]]); const s = await sketch(page), arc = s.entities[0];
    await addConstraint(page, 'fixed', [arc.centerPointId]); parameterId = await addConstraint(page, 'fixed', [arc.startPointId]); await addConstraint(page, 'horizontal', [s.entities[1].id]); fixed = true;
  }
  const source = await finish(page), solid = await extrude(page, kind === 'half' ? -10 : 10), before = await documentData(page), first = await metrics(page, solid.id), factor = kind === 'circle' ? 1 : 0.5; volume(first, factor * 1000 * Math.PI, true);
  await editSource(page, source.id); await editConstraint(page, parameterId, fixed ? -12 : 12, fixed); const diag = await diagnostic(page), changedSource = await sketch(page); assert.equal(diag.dof, 0); await finish(page);
  const after = await documentData(page), actual = await metrics(page, solid.id), expectedVolumeMm3 = factor * 1440 * Math.PI; volume(actual, expectedVolumeMm3, true); assert.deepEqual(after.features.at(-1), solid); await exactUndoRedo(page, before, after, solid.id, first, actual);
  const failure = await rejection(page, source.id, solid, 'inconsistent', () => addConstraint(page, 'radius', [source.entities[0].id], 11, false));
  assert.deepEqual(failure.actual, actual);
  return { kind, parameterId, inputChange: fixed ? 'fixed endpoint X -10→-12; intrinsic radius 10→12' : 'radius 10→12', sourceDefinition: solid, first, actual, expectedVolumeMm3, changedSource, diagnostics: diag, failure, exactGeometryConstraintUndoRedo: true, passed: true };
}
async function check(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = [], workers = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('worker', w => workers.push(w.url()));
  try {
    await page.goto(url); await page.locator('[data-computation="ready"]').waitFor({ timeout: 15000 }); await page.locator('[data-viewport-state="ready"]').waitFor();
    const cases = []; for (const plane of ['XY', 'XZ', 'YZ']) { cases.push(await rectangle(page, plane)); cases.push(await rectangle(page, plane, true)); }
    cases.push(await curve(page, 'circle')); cases.push(await curve(page, 'half')); assert.equal(errors.length, 0, errors.join('\n'));
    await page.screenshot({ path: `.research/T-203-${mode.replaceAll('/', '')}.png`, fullPage: true }); results.push({ mode, cases, workers, browserErrors: errors, passed: true });
  } catch (cause) { await page.screenshot({ path: '.research/T-203-failure.png', fullPage: true }); console.error('Alerts:', await page.getByRole('alert').allTextContents()); console.error('Status:', await page.locator('.workspace-status').textContent()); throw cause; }
  finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); await check('production-root', `http://127.0.0.1:${production.httpServer.address().port}/`);
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-parameters-cad', emptyOutDir: true } }); subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-parameters-cad' }, preview: { host: '127.0.0.1', port: 0 } }); await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync('docs/learning/evidence/T-203-parameters-browser.json', JSON.stringify({ task: 'T-203', executedAt: new Date().toISOString(), command: 'npm run check:parameters:browser', environment: { node: process.version, browser: browser.version() }, results, passed: true,
    tolerances: { straightVolumeMm3: 1e-6, curveRelativeVolume: 0.01, nativeResidual: 1e-5 }, limitations: ['Only Edge; final three-browser/performance acceptance later.', 'File/Boolean workflow not covered; full sketch/extrude recomputation.'] }, null, 2) + '\n');
  console.log('PASS: three entrances × three-plane rectangle/hole parameter edits, circle/arc radius, stable source IDs, real native and descendant failures, exact geometry/constraint/diagnostic history.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
