import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { launchBrowserUi } from './browser-ui-port.mjs';
import { change, documentData, editWidth, extrude, finish, open, ready, rectangle, revision, save, solidMetrics, volume } from './e2e-ui-steps.mjs';
import { parseBinaryStl } from '../src/adapters/files/parse-binary-stl.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';

const root = fileURLToPath(new URL('../', import.meta.url)), results = [];
async function flow(ui) {
  const rectangleIds = await rectangle(ui);
  await finish(ui);
  const solid = await extrude(ui, 10), ids = (await documentData(ui)).features.map(f => f.id);
  const initial = await solidMetrics(ui, solid.id); volume(initial, 12000);
  await editWidth(ui, rectangleIds, 60);
  assert.deepEqual((await documentData(ui)).features.map(f => f.id), ids);
  const edited = await solidMetrics(ui, solid.id); volume(edited, 18000);
  await change(ui, () => ui.click('撤销')); volume(await solidMetrics(ui, solid.id), 12000);
  await change(ui, () => ui.click('重做')); volume(await solidMetrics(ui, solid.id), 18000);

  // Focus a text field: model undo must leave the document alone; Ctrl+S remains available.
  const beforeFocus = await documentData(ui), focusRevision = await revision(ui);
  await ui.fill('项目名称', beforeFocus.name);
  await ui.key('Control+z');
  assert.deepEqual(await documentData(ui), beforeFocus); assert.equal(await revision(ui), focusRevision);
  const downloaded = await save(ui, true);
  assert.deepEqual(downloaded.document, await documentData(ui));
  await ui.wait(() => /已更新/.test(document.querySelector('.project-recovery')?.textContent));
  await ui.reload(); await ready(ui);
  await ui.wait(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '恢复项目'));
  await open(ui, downloaded.path);
  assert.deepEqual(await documentData(ui), downloaded.document);
  assert(await ui.evaluate(() => [...document.querySelectorAll('button')].filter(b => ['撤销', '重做'].includes(b.textContent.trim())).every(b => b.disabled)));
  volume(await solidMetrics(ui, solid.id), 18000);
  await editWidth(ui, rectangleIds, 70);
  const continued = await solidMetrics(ui, solid.id); volume(continued, 21000);
  assert.deepEqual((await documentData(ui)).features.map(f => f.id), ids);
  const beforeExport = await documentData(ui), exportRevision = await revision(ui);
  const stl = await ui.download(() => ui.click('导出 STL'), '.stl'), bytes = readFileSync(stl.path);
  const parsed = parseBinaryStl(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), actual = meshMetrics(parsed.mesh);
  volume(actual, 21000);
  assert.deepEqual(actual.bounds, continued.bounds);
  assert.deepEqual(await documentData(ui), beforeExport); assert.equal(await revision(ui), exportRevision);
  assert.equal(bytes.length, 84 + 50 * parsed.triangles);
  for (let i = 0; i < parsed.normals.length; i += 3) assert(Math.abs(Math.hypot(...parsed.normals.slice(i, i + 3)) - 1) <= 1e-5);
  const view = await ui.evaluate(() => {
    const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { width: innerWidth, height: innerHeight, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  // Explicit beforeunload event checks the production handler on the current dirty document.
  const unload = await ui.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
  assert(unload);
  const layout = await layoutFlow(ui), recovery = await recoveryFlow(ui, solid.id, beforeExport);
  return { rectangle: rectangleIds, solidId: solid.id, fixedDof: 0, volumesMm3: [initial.signedVolume, edited.signedVolume, continued.signedVolume], stableFeatureIds: ids, exactUndoRedoVolumes: true, actualJsonDownload: downloaded.name, exactManualReopenAndEmptyHistory: true, refreshRecoveryOffered: true, textFocusModelUndoProtected: true, textFocusCtrlSSavedActualFile: true, dirtyBeforeUnloadHandler: unload, stl: { name: stl.name, bytes: bytes.length, triangles: parsed.triangles, metrics: actual, normalizedNormals: true, unchangedAuthority: true }, view, layout, recovery, passed: true };
}
async function layoutFlow(ui) {
  const width = () => ui.evaluate(() => document.querySelector('canvas').getBoundingClientRect().width);
  const before = await width();
  await ui.click('折叠特征树'); await ui.click('折叠属性');
  const after = await width(); assert(after > before);
  const sizes = [];
  // Native Firefox enforces a 500px minimum window width on this Windows host.
  for (const [width, height] of [[1024, 720], [500, 844]]) {
    await ui.resize(width, height);
    await ui.wait(({width,height}) => innerWidth === width && innerHeight === height, {width,height});
    assert(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 500) assert(await ui.evaluate(() => getComputedStyle(document.querySelector('.narrow-layout-hint')).display !== 'none'));
    sizes.push({width, height, noHorizontalOverflow: true});
  }
  await ui.resize(1280, 720);
  await ui.click('展开特征树'); await ui.click('展开属性');
  return { fullFlowViewport: {width: 1280, height: 720}, canvasWidthBeforeCollapse: before, canvasWidthAfterCollapse: after, sizes, narrowHint: true, passed: true };
}
async function recoveryFlow(ui, solidId, expected) {
  await ui.wait(() => document.querySelector('[data-recovery-state="saved"]'));
  await ui.reload(); await ready(ui);
  await ui.click('恢复项目');
  await ui.wait(() => document.querySelector('[data-recovery-state="waiting"], [data-recovery-state="saved"]'));
  assert.deepEqual(await documentData(ui), expected);
  volume(await solidMetrics(ui, solidId), 21000);
  assert(await ui.evaluate(() => /未保存的修改/.test(document.querySelector('.workspace-header').textContent)));
  assert(await ui.evaluate(() => [...document.querySelectorAll('button')].filter(b => ['撤销', '重做'].includes(b.textContent.trim())).every(b => b.disabled)));
  await ui.wait(() => document.querySelector('[data-recovery-state="saved"]'));
  await ui.reload(); await ready(ui); await ui.click('放弃恢复副本');
  await ui.wait(() => document.querySelector('[data-recovery-state="idle"]'));
  assert.equal((await documentData(ui)).features.length, 0);
  return { realIndexedDbRefreshAndExplicitRestore: true, restoredVolumeMm3: 21000, exactDocument: true, recoveredDirtyAndEmptyHistory: true, explicitDiscardKeepsNewEmptyProject: true, passed: true };
}
async function close(server) {
  if (!server) return;
  server.httpServer.closeAllConnections();
  await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve()));
}
let production, subpath;
try {
  await build({ root });
  production = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
  await build({ root, base: '/cad/', build: { outDir: '.research/dist-current-cad', emptyOutDir: true } });
  subpath = await preview({ root, base: '/cad/', build: { outDir: '.research/dist-current-cad' }, preview: { host: '127.0.0.1', port: 0 } });
  for (const kind of (process.env.E2E_BROWSER_KINDS ?? 'chrome,edge,firefox').split(',')) {
    for (const [mode, url] of [['production-root', `http://127.0.0.1:${production.httpServer.address().port}/`], ['production-/cad/', `http://127.0.0.1:${subpath.httpServer.address().port}/cad/`]]) {
      const ui = await launchBrowserUi(kind);
      try {
        await ui.navigate(url); await ready(ui); await ui.resize(1280, 720);
        const result = await flow(ui);
        results.push({ kind, version: ui.version, mode, ...result });
        console.log(`PASS ${kind} ${ui.version} ${mode}: UI creation / DOF0 / 12000→18000→21000 / real files / STL`);
      } catch (cause) {
        await ui.screenshot(`.research/T-403A-${kind}-failure.png`);
        console.error(await ui.evaluate(() => ({ status: document.querySelector('.workspace-status')?.textContent, alerts: [...document.querySelectorAll('[role="alert"]')].map(e => e.textContent) })));
        throw cause;
      } finally { await ui.close(); }
    }
  }
  writeFileSync('docs/learning/evidence/T-403A-current-browsers.json', JSON.stringify({ task: 'T-403A', scenarios: ['E2E-01', 'E2E-05'], executedAt: new Date().toISOString(), command: 'npm run check:current-browsers', environment: { node: process.version, platform: process.platform, playwright: '1.63.0', geckodriver: '0.37.1', three: '0.186.1' }, results, tolerances: { straightVolumeMm3: 1e-6, normalLength: 1e-5 }, passed: true, limitations: ['Firefox uses the official stable executable through WebDriver, not Playwright-patched Firefox.', 'Beforeunload handler is verified by a dispatched cancelable event; actual native reload prompt on Edge was verified in T-401B.', 'E2E-02/03/04 and performance/resource acceptance remain T-403B/C.', 'Firefox may mask the GPU name. The actual machine GPU is recorded separately from the reported WebGL renderer.'] }, null, 2) + '\n');
} finally { await close(production); await close(subpath); }
