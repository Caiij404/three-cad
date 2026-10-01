import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest = readJson(path.join(root, 'package.json'));
const lock = readJson(path.join(root, 'package-lock.json'));
assert.equal(process.version, `v${manifest.engines.node}`);
const npmAgent = process.env.npm_config_user_agent;
assert(npmAgent, 'Run this script with npm run record:toolchain');
const npmVersion = npmAgent.match(/^npm\/([^ ]+)/)?.[1];
assert.equal(manifest.packageManager, `npm@${npmVersion}`);
const directNames = new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }));
const packages = Object.entries(lock.packages).filter(([key]) => key).map(([installPath, entry]) => {
  const packagePath = path.join(root, installPath, 'package.json');
  const installed = existsSync(packagePath) ? readJson(packagePath) : null;
  if (installed) assert.equal(installed.version, entry.version, `Installed version differs: ${installPath}`);
  const name = entry.name || installed?.name || installPath.split('node_modules/').at(-1);
  return { name, version: entry.version, direct: directNames.has(name), installPath,
    license: entry.license || installed?.license || 'not declared', resolved: entry.resolved,
    integrity: entry.integrity, optional: Boolean(entry.optional), installed: Boolean(installed),
    repository: installed?.repository || null, gitHead: installed?.gitHead || null };
});
const archive = path.join(root, '.research/runtime/node-v24.21.0-win-x64.zip');
const archiveHash = existsSync(archive) ? sha256(archive) : null;
const expectedHash = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541';
if (archiveHash) assert.equal(archiveHash, expectedHash);
const licenseDirectory = path.join(root, 'docs/third-party/licenses');
mkdirSync(licenseDirectory, { recursive: true });
copyFileSync(path.join(root, 'node_modules/vue/LICENSE'), path.join(licenseDirectory, 'vue-MIT.txt'));
mkdirSync(path.join(root, 'public'), { recursive: true });
const runtimeNames = ['vue', '@vue/shared', '@vue/reactivity', '@vue/runtime-core', '@vue/runtime-dom'];
const vueLicense = readFileSync(path.join(root, 'node_modules/vue/LICENSE'), 'utf8');
for (const name of runtimeNames) {
  assert.equal(readFileSync(path.join(root, 'node_modules', name, 'LICENSE'), 'utf8'), vueLicense);
}
writeFileSync(path.join(root, 'public/THIRD_PARTY_NOTICES.txt'),
  `Runtime packages: ${runtimeNames.join(', ')}\nVersion: ${manifest.dependencies.vue}\nSource: https://github.com/vuejs/core\n\n${vueLicense}`);
if (manifest.dependencies.three) {
  const threeLicense=readFileSync(path.join(root,'node_modules/three/LICENSE'),'utf8');
  copyFileSync(path.join(root,'node_modules/three/LICENSE'),path.join(licenseDirectory,'three-MIT.txt'));
  const vueNotice=readFileSync(path.join(root,'public/THIRD_PARTY_NOTICES.txt'),'utf8');
  writeFileSync(path.join(root,'public/THIRD_PARTY_NOTICES.txt'),`${vueNotice}\nThree.js ${manifest.dependencies.three}\n${threeLicense}\nCSG core and Earcut declarations: solid/CSG-MIT.txt, solid/UPSTREAM-README.txt, solid/earcut-LICENSE.txt\nSolveSpace and build runtime declarations: wasm/licenses/ and wasm/BUILD_SOURCE.json\n`);
}
const record = { task: manifest.dependencies.three ? 'T-004' : 'T-002', checkedAt: new Date().toISOString(),
  method: 'Read exact package-lock entries and installed npm package manifests; no vendored npm code modifications.',
  environment: { node: process.version, npm: npmVersion, platform: process.platform, arch: process.arch },
  nodeSource: { url: 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip',
    checksums: 'https://nodejs.org/dist/v24.21.0/SHASUMS256.txt', expectedArchiveSha256: expectedHash,
    actualArchiveSha256: archiveHash, executableSha256: sha256(process.execPath) },
  lockfileSha256: sha256(path.join(root, 'package-lock.json')),
  runtimeLicense: { original: 'node_modules/vue/LICENSE', retained: 'docs/third-party/licenses/vue-MIT.txt',
    sha256: sha256(path.join(licenseDirectory, 'vue-MIT.txt')),
    productionNotice: 'public/THIRD_PARTY_NOTICES.txt' }, packages };
writeFileSync(path.join(root, 'docs/third-party/npm-dependencies.json'), JSON.stringify(record, null, 2) + '\n');
console.log(`Recorded ${packages.length} locked packages; ${packages.filter(item => item.installed).length} installed on ${process.platform}.`);
console.log('Source: docs/third-party/npm-dependencies.json; Vue MIT declaration retained verbatim.');
