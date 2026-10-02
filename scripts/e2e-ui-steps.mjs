import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const json = (ui, id) => ui.evaluate(id => JSON.parse(document.querySelector(`[data-testid="${id}"]`).textContent), id);
export const documentData = ui => json(ui, 'project-document-data');
export const sketchData = ui => json(ui, 'active-sketch-data');
export const revision = ui => ui.evaluate(() => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]));
export async function ready(ui) {
  await ui.wait(() => document.querySelector('[data-computation="ready"]'), null, 20000);
  await ui.wait(() => document.querySelector('[data-viewport-state="ready"]'));
}
export async function change(ui, action) {
  const before = await revision(ui);
  await action();
  await ui.wait(rev => Number(document.querySelector('.workspace-status').textContent.match(/revision (\d+)/)[1]) === rev + 1, before);
}
export async function point(ui, x, y) {
  await ui.fill('下一点 X (mm)', x);
  await ui.fill('下一点 Y (mm)', y);
  await ui.click('输入此点');
}
export async function draw(ui, tool, points) {
  await ui.click(tool);
  for (const p of points.slice(0, -1)) await point(ui, ...p);
  await change(ui, () => point(ui, ...points.at(-1)));
  await ui.key('Escape');
}
export async function start(ui, plane = 'XY') {
  await ui.click(`${plane} 平面`);
  await change(ui, () => ui.click('新建草图'));
}
export async function fresh(ui) {
  const dirty=await ui.evaluate(()=>/未保存的修改/.test(document.querySelector('.workspace-header').textContent));
  await change(ui,async()=>{await ui.click('新建');if(dirty)await ui.click('丢弃修改并新建');});
  assert.equal((await documentData(ui)).features.length,0);
}
export async function objects(ui) {
  if (!await ui.evaluate(() => document.querySelector('.sketch-objects').open)) await ui.clickCss('.sketch-objects summary');
}
export async function constraint(ui, entityId, kind, value) {
  await objects(ui);
  const point=(await sketchData(ui)).points.some(p=>p.id===entityId);
  await ui.clickCss(`[${point?'data-point-select-id':'data-entity-id'}="${entityId}"]`);
  await ui.click('约束');
  await ui.choose('约束类型', kind);
  if (value !== undefined) await ui.fill('新约束数值 (mm)', value);
  await change(ui, () => ui.click('添加约束'));
  return (await sketchData(ui)).constraints.at(-1).id;
}
export async function rectangle(ui, { plane = 'XY', x = 0, y = 0, width = 40, height = 30 } = {}) {
  await start(ui, plane);
  await draw(ui, '矩形', [[x, y], [x + width, y + height]]);
  const sketch = await sketchData(ui);
  const widthId = await constraint(ui, sketch.entities[0].id, 'length', width);
  const heightId = await constraint(ui, sketch.entities[1].id, 'length', height);
  if((await json(ui,'active-sketch-diagnostics')).dof>0)await constraint(ui,sketch.points[0].id,'fixed');
  assert.equal((await json(ui, 'active-sketch-diagnostics')).dof, 0);
  return { sketchId: sketch.id, widthId, heightId };
}
export async function feature(ui, id) { await ui.clickCss(`[data-feature-id="${id}"]`); }
export async function finish(ui) {
  const sketch = await sketchData(ui);
  await ui.click('完成草图');
  await feature(ui, sketch.id);
  return sketch;
}
export async function extrude(ui, depth = 10) {
  await ui.click('拉伸');
  await ui.wait(() => document.querySelector('[data-extrusion-status="ready"]'));
  await ui.fill('拉伸深度 (mm)', depth);
  await ui.wait(depth => {
    const raw = document.querySelector('[data-testid="extrusion-preview-metrics"]')?.textContent;
    return raw && JSON.parse(raw).depth === depth;
  }, depth);
  await change(ui, () => ui.click('确认拉伸'));
  return (await documentData(ui)).features.at(-1);
}
export async function editWidth(ui, rectangle, width) {
  await feature(ui, rectangle.sketchId);
  await ui.click('编辑草图');
  const row = `[data-constraint-id="${rectangle.widthId}"]`;
  await ui.fill('约束数值 (mm)', width, row);
  await change(ui, () => ui.clickCss(`${row} button`, '应用数值'));
  await ui.click('完成草图');
}
export async function solidMetrics(ui, id) {
  await feature(ui, id);
  return json(ui, 'committed-solid-metrics');
}
export function volume(actual, expected, tolerance = 1e-6) {
  assert(actual.closed && actual.windingErrors === 0 && actual.degenerateTriangles === 0);
  assert(Math.abs(actual.signedVolume - expected) <= tolerance, `volume ${actual.signedVolume} != ${expected}`);
}
export async function save(ui, shortcut = false) {
  const file = await ui.download(() => shortcut ? ui.key('Control+s') : ui.click('保存'), '.tcad.json');
  const text = readFileSync(file.path, 'utf8'), document = JSON.parse(text);
  await ui.click('确认文件已保存');
  assert(await ui.evaluate(() => /未修改/.test(document.querySelector('.workspace-header').textContent)));
  return { ...file, text, document };
}
export async function open(ui, path) {
  const dirty = await ui.evaluate(() => /未保存的修改/.test(document.querySelector('.workspace-header').textContent));
  await change(ui, async () => {
    await ui.upload(path);
    if (dirty) await ui.click('丢弃修改并打开');
  });
}
