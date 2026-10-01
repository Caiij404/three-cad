import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
const browser = await chromium.launch({ channel: process.env.BOOTSTRAP_BROWSER_CHANNEL || 'msedge', headless: true }); let dev, production, subpath;
const sketch = async page => JSON.parse(await page.locator('[data-testid="active-sketch-data"]').textContent());
const diagnostic = async page => JSON.parse(await page.locator('[data-testid="active-sketch-diagnostics"]').textContent());
const revision = async page => Number((await page.locator('.workspace-status').textContent()).match(/revision (\d+)/)[1]);
async function change(page, action) { const before = await revision(page); await action(); await page.waitForFunction(rev => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) > rev, before); }
async function point(page, x, y) { await page.getByLabel('下一点 X (mm)', { exact: true }).fill(String(x)); await page.getByLabel('下一点 Y (mm)', { exact: true }).fill(String(y)); await page.getByRole('button', { name: '输入此点', exact: true }).click(); }
async function draw(page, tool, points) { await page.getByRole('button', { name: tool, exact: true }).click(); for (let i = 0; i < points.length - 1; i++) await point(page, ...points[i]); await change(page, () => point(page, ...points.at(-1))); await page.keyboard.press('Escape'); }
async function fresh(page, plane = 'XY') { await page.getByRole('button', { name: '新建', exact: true }).click(); const discard = page.getByRole('button', { name: '丢弃修改并新建', exact: true }); if (await discard.isVisible()) await discard.click(); await page.getByRole('button', { name: `${plane} 平面`, exact: true }).click(); await change(page, () => page.getByRole('button', { name: '新建草图', exact: true }).click()); }
async function openObjects(page) { const details = page.locator('.sketch-objects'); if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click(); }
async function select(page, ids) { await openObjects(page); for (let i = 0; i < ids.length; i++) { const s = await sketch(page), point = s.points.some(p => p.id === ids[i]); if (i) await page.keyboard.down('Control'); await page.locator(`[${point ? 'data-point-select-id' : 'data-entity-id'}="${ids[i]}"]`).click(); if (i) await page.keyboard.up('Control'); } }
async function constraint(page, kind, ids, value) {
  await select(page, ids); await page.getByRole('button', { name: '约束', exact: true }).click(); await page.getByLabel('约束类型', { exact: true }).selectOption(kind);
  if (value !== undefined) await page.getByLabel(`新约束数值 (${kind === 'angle' ? '°' : 'mm'})`, { exact: true }).fill(String(value));
  await change(page, () => page.getByRole('button', { name: '添加约束', exact: true }).click()); return (await sketch(page)).constraints.at(-1).id;
}
function dimensions(s) { const xs = s.points.map(p => p.position[0]), ys = s.points.map(p => p.position[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; }
async function projected(page, position) { const box = await page.locator('canvas').boundingBox(), scale = box.height / (70 * Math.SQRT2 * 1.2); return { x: box.x + box.width / 2 + position[0] * scale, y: box.y + box.height / 2 - position[1] * scale }; }
async function gesture(page, from, to, shouldCommit) { await page.getByRole('button', { name: '选择', exact: true }).click(); const a = await projected(page, from), b = await projected(page, to), rev = await revision(page); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 30 }); await page.mouse.up(); if (shouldCommit) await page.waitForFunction(rev => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) === rev + 1, rev); else await page.waitForFunction(() => !document.querySelector('[aria-label="拖动状态"]')); return rev; }
async function rectangleFlow(page, plane) {
  await fresh(page, plane); assert.equal(await diagnostic(page), null); await draw(page, '矩形', [[0, 0], [40, 30]]); let s = await sketch(page);
  const width = await constraint(page, 'length', [s.entities[0].id], 40); s = await sketch(page); const height = await constraint(page, 'length', [s.entities[1].id], 30);
  assert.equal((await diagnostic(page)).dof, 0); const held = await sketch(page), heldRev = await gesture(page, [40, 30], [55, 40], false); assert.deepEqual(await sketch(page), held); assert.equal(await revision(page), heldRev);
  const row = page.locator(`[data-constraint-id="${width}"]`); await row.getByLabel('约束数值 (mm)', { exact: true }).fill('60'); await change(page, () => row.getByRole('button', { name: '应用数值', exact: true }).click());
  s = await sketch(page); dimensions(s).forEach((d, i) => assert(Math.abs(d - [60, 30][i]) <= 1e-5)); await page.locator(`[data-dimension-id="${width}"]`).filter({ hasText: 'L 60.000 mm' }).waitFor();
  await change(page, () => page.getByRole('button', { name: '撤销', exact: true }).click()); assert(Math.abs(dimensions(await sketch(page))[0] - 40) <= 1e-5); await change(page, () => page.getByRole('button', { name: '重做', exact: true }).click()); assert.deepEqual(await sketch(page), s);
  const diag = await diagnostic(page), rev = await revision(page); await select(page, [s.entities[0].id]); await page.getByRole('button', { name: '约束', exact: true }).click(); await page.getByLabel('约束类型').selectOption('length'); await page.getByLabel('新约束数值 (mm)').fill('50'); await page.getByRole('button', { name: '添加约束', exact: true }).click(); await page.locator('[data-attempt-state="inconsistent"]').waitFor();
  assert.deepEqual(await sketch(page), s); assert.deepEqual(await diagnostic(page), diag); assert.equal(await revision(page), rev); assert.equal(await page.locator(`[data-constraint-id="${width}"]`).getAttribute('data-conflict'), 'true');
  await change(page, () => page.locator(`[data-constraint-id="${width}"]`).getByRole('button', { name: '删除约束', exact: true }).click()); assert.equal((await diagnostic(page)).dof, 1); await page.locator(`[data-dimension-id="${width}"]`).waitFor({state:'detached'});
  await gesture(page, [60, 30], [65, 35], true); const moved = await sketch(page); assert(Math.abs(dimensions(moved)[0] - 65) <= 1e-5); assert(Math.abs(dimensions(moved)[1] - 30) <= 1e-5);
  const p = moved.entities[0].endPointId, fixedId = await constraint(page, 'fixed', [p]); assert.equal((await diagnostic(page)).dof, 0);
  const fixedRow = page.locator(`[data-constraint-id="${fixedId}"]`); await fixedRow.getByLabel('固定 X (mm)', {exact:true}).fill('70'); await change(page,()=>fixedRow.getByRole('button',{name:'应用坐标',exact:true}).click()); assert(Math.abs(dimensions(await sketch(page))[0]-70)<=1e-5);
  const illegalKinds=[];
  for(const [kind,ids] of [['length',[p]],['fixed',[moved.entities[0].id]]]) {
    const before=await sketch(page),diagnosticBefore=await diagnostic(page),rev=await revision(page);await select(page,ids);await page.getByLabel('约束类型').selectOption(kind);await page.getByRole('button',{name:'添加约束',exact:true}).click();await page.locator('[data-attempt-state="validation-failed"]').waitFor();assert.deepEqual(await sketch(page),before);assert.deepEqual(await diagnostic(page),diagnosticBefore);assert.equal(await revision(page),rev);illegalKinds.push({kind,ids,candidateUnchanged:true});
  }
  return { plane, widthId: width, heightId: height, constrained: held, changed: s, freeMoved: moved, final: await sketch(page), diagnostics: await diagnostic(page), fixedDragNoCommit: true, actualDimensionsMm: [dimensions(held), dimensions(s), dimensions(moved)], fixedCoordinateEditWidthMm:70,illegalKinds,conflictDocumentDiagnosticsRevisionUnchanged: true, dofs: [0, 1, 0], toleranceMm: 1e-5, passed: true };
}
async function otherTypes(page) {
  const cases = [];
  for (const kind of ['coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'distance', 'angle', 'radius', 'equal', 'tangent']) {
    await fresh(page);
    if (kind === 'radius' || kind === 'tangent') { await draw(page, '圆', [[0, 0], [10, 0]]); if (kind === 'tangent') await draw(page, '线段', [[-20, 8], [20, 8]]); }
    else { await draw(page, '线段', [[-20, -20], [-5, -18]]); if (['coincident', 'parallel', 'perpendicular', 'distance', 'angle', 'equal'].includes(kind)) await draw(page, '线段', [[0, 15], [12, 20]]); }
    const s = await sketch(page); let ids;
    if (kind === 'coincident' || kind === 'distance') ids = [s.entities[0].endPointId, s.entities[1].startPointId];
    else if (['horizontal', 'vertical', 'radius'].includes(kind)) ids = [s.entities[0].id]; else ids = s.entities.slice(0, 2).map(e => e.id);
    const id = await constraint(page, kind, ids, kind === 'distance' ? 20 : kind === 'angle' ? 60 : kind === 'radius' ? 12 : undefined);
    const result = await sketch(page), d = await diagnostic(page); assert(Object.values(d.residuals).every(n => n <= 1e-5));
    if (kind === 'angle') await page.locator(`[data-dimension-id="${id}"]`).filter({ hasText: '60.000°' }).waitFor();
    if (kind === 'radius') await page.locator(`[data-dimension-id="${id}"]`).filter({ hasText: 'R 12.000 mm' }).waitFor();
    let edited;
    if (kind==='angle'||kind==='radius'){
      const row=page.locator(`[data-constraint-id="${id}"]`),target=kind==='angle'?120:14;await row.getByLabel(`约束数值 (${kind==='angle'?'°':'mm'})`,{exact:true}).fill(String(target));await change(page,()=>row.getByRole('button',{name:'应用数值',exact:true}).click());await page.locator(`[data-dimension-id="${id}"]`).filter({hasText:kind==='angle'?'120.000°':'R 14.000 mm'}).waitFor();edited={target,result:await sketch(page),diagnostics:await diagnostic(page)};
    }
    const before = await sketch(page), rev = await revision(page), diagnosticBefore = await diagnostic(page);
    // Each kind gets a deliberately invalid object/count selection through the actual form.
    const invalidIds = ['coincident', 'distance', 'fixed'].includes(kind) ? [result.entities[0].id] : kind === 'tangent' ? [result.entities[0].id] : [result.points[0].id];
    await select(page, invalidIds); await page.getByLabel('约束类型').selectOption(kind); await page.getByRole('button', { name: '添加约束', exact: true }).click(); await page.locator('[data-attempt-state="validation-failed"]').waitFor();
    assert.deepEqual(await sketch(page), before); assert.deepEqual(await diagnostic(page), diagnosticBefore); assert.equal(await revision(page), rev);
    cases.push({ kind, input: s, result, diagnostics: d,edited,invalidIds, illegalCandidateUnchanged: true, passed: true });
  }
  return cases;
}
async function check(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = [], workers = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('worker', w => workers.push(w.url()));
  try {
    await page.goto(url); await page.locator('[data-computation="ready"]').waitFor({ timeout: 15000 }); await page.locator('[data-viewport-state="ready"]').waitFor();
    const planes = []; for (const plane of ['XY', 'XZ', 'YZ']) planes.push(await rectangleFlow(page, plane));
    const types = await otherTypes(page); assert.equal(errors.length, 0, errors.join('\n')); await page.screenshot({ path: `.research/T-201C2-${mode.replaceAll('/', '')}.png`, fullPage: true });
    results.push({ mode, planes, types, workers, browserErrors: errors, passed: true });
  } catch (cause) {
    await page.screenshot({ path: '.research/T-201C2-failure.png', fullPage: true });
    console.error('Current alerts:', await page.getByRole('alert').allTextContents()); console.error('Current status:', await page.locator('[data-testid="sketch-solve-status"]').allTextContents()); throw cause;
  } finally { await context.close(); }
}
async function closePreview(server) { if (!server) return; server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); }
try {
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen(); await check('development', `http://127.0.0.1:${dev.httpServer.address().port}/`);
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } }); await check('production-root', `http://127.0.0.1:${production.httpServer.address().port}/`);
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-constraints-cad', emptyOutDir: true } }); subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-constraints-cad' }, preview: { host: '127.0.0.1', port: 0 } }); await check('production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`);
  writeFileSync(process.env.CONSTRAINT_BROWSER_EVIDENCE_PATH ?? 'docs/learning/evidence/T-201C2-constraints-browser.json', JSON.stringify({ task: process.env.CONSTRAINT_BROWSER_EVIDENCE_TASK ?? 'T-201C2', executedAt: new Date().toISOString(), command: 'npm run check:constraints:browser', environment: { node: process.version, browser: browser.version() }, results, passed: true, limitations: ['Only Edge measured; final three-browser/performance acceptance later.', 'Race/cold-cancel regression is separate sketch-edit replay evidence.'] }, null, 2) + '\n'); console.log('PASS: three entrances, three-plane rectangle constraint/drag/history/conflict/free/fixed/labels, all P0 panel types and illegal forms.');
} finally { if (dev) await dev.close(); await closePreview(production); await closePreview(subpath); await browser.close(); }
