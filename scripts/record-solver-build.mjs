import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const src = path.join(root, '.research/solvespace-src');
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { windowsHide: true });
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
const repositories = [
  { name: 'SolveSpace', directory: src, url: 'https://github.com/solvespace/solvespace', commit: '2879a02d2866e103d7a4817721ead9ac43558aea', license: 'GPL-3.0-or-later', files: ['COPYING.txt', 'THIRD_PARTIES.txt'] },
  { name: 'Eigen', directory: path.join(src, 'extlib/eigen'), url: 'https://gitlab.com/libeigen/eigen', commit: '3147391d946bb4b6c68edd901f2add6ac1f31f8c', license: 'MPL-2.0 and per-file permissive licenses; EIGEN_MPL2_ONLY defined', files: ['COPYING.README', 'COPYING.MPL2', 'COPYING.BSD', 'COPYING.MINPACK', 'COPYING.LGPL', 'COPYING.GPL'] },
  { name: 'mimalloc', directory: path.join(src, 'extlib/mimalloc'), url: 'https://github.com/microsoft/mimalloc', commit: 'f81bf1b31af819a31195e08f9546dc80f8931587', license: 'MIT', files: ['LICENSE'] },
];
const licenses = [];
const licenseDirectory = path.join(root, 'public/wasm/licenses');
mkdirSync(licenseDirectory, { recursive: true });
for (const repo of repositories) {
  assert.equal(git(repo.directory, 'rev-parse', 'HEAD').toString().trim(), repo.commit);
  for (const original of repo.files) {
    const bytes = git(repo.directory, 'show', `HEAD:${original}`);
    const retained = `public/wasm/licenses/${repo.name.toLowerCase()}-${original.replaceAll('.', '-')}.txt`;
    writeFileSync(path.join(root, retained), bytes);
    licenses.push({ source: repo.name, original, retained, sha256: createHash('sha256').update(bytes).digest('hex') });
    if (repo.name === 'SolveSpace' && original === 'COPYING.txt') writeFileSync(path.join(root, 'LICENSE'), bytes);
  }
}
const sdkRuntimeFiles = ['LICENSE', 'system/lib/libc/musl/COPYRIGHT', 'system/lib/libcxx/LICENSE.TXT',
  'system/lib/libcxxabi/LICENSE.TXT', 'system/lib/compiler-rt/LICENSE.TXT'];
for (const original of sdkRuntimeFiles) {
  const bytes = readFileSync(path.join(root, '.research/emsdk/upstream/emscripten', original));
  const retained = `public/wasm/licenses/emscripten-${original.replaceAll('/', '-').replaceAll('.', '-')}.txt`;
  writeFileSync(path.join(root, retained), bytes);
  licenses.push({ source: 'Emscripten 4.0.8 runtime', original, retained,
    sha256: createHash('sha256').update(bytes).digest('hex') });
}
const artifacts = {};
for (const file of ['slvs.mjs', 'slvs.wasm']) {
  const absolute = path.join(root, 'public/wasm', file);
  artifacts[file] = { bytes: statSync(absolute).size, sha256: await hash(absolute) };
}
const toolFiles = [
  '.research/tools/cmake-3.31.8-windows-x86_64.zip', '.research/tools/ninja-1.13.2-py3-none-win_amd64.whl',
  '.research/emsdk/upstream/bin/clang.exe', '.research/emsdk/upstream/bin/wasm-ld.exe',
];
const toolHashes = {};
for (const file of toolFiles) toolHashes[file] = { bytes: statSync(path.join(root, file)).size, sha256: await hash(path.join(root, file)) };
assert.equal(toolHashes[toolFiles[0]].sha256, '81aa9964dbabd71fe02e7ec50472fd3ad56138c49944515ece9001efbff8d719');
assert.equal(toolHashes[toolFiles[1]].sha256, '1293f4078278b70d0ee4b6cc8f3a9e030656c9b2f59909970343c4fe76070118');
const patches = [];
for (const file of ['solvespace-js-array.patch', 'solvespace-esm-build.patch', 'solvespace-gitdir.patch']) patches.push({ file: `patches/${file}`, sha256: await hash(path.join(root, 'patches', file)) });
const metadata = { task: 'T-003', builtAtRecorded: new Date().toISOString(),
  sourceRepositories: repositories.map(({ directory, ...repo }) => repo), patches, licenses,
  toolchain: { emsdkCommit: git(path.join(root, '.research/emsdk'), 'rev-parse', 'HEAD').toString().trim(),
    emscripten: '4.0.8', llvmReleaseBuild: '56f86607aeb458086e72f23188789be2ee0e971a',
    emscriptenSourceCommit: '70404efec4458b60b953bc8f1529f2fa112cdfd1', clang: '21.0.0',
    sdkReleaseUrl: 'https://storage.googleapis.com/webassembly/emscripten-releases-builds/win/56f86607aeb458086e72f23188789be2ee0e971a/wasm-binaries.zip',
    sdkArchiveRetention: 'Installer removed the downloaded archive; hashes below identify actual installed compiler/linker files.',
    cmake: '3.31.8', ninja: '1.13.2.git.kitware.jobserver-pipe-1', ninjaDistribution: 'PyPI ninja 1.13.2, scikit-build/ninja-python-distributions',
    cmakeDigestSource: 'https://api.github.com/repos/Kitware/CMake/releases/tags/v3.31.8',
    ninjaDigestSource: 'https://pypi.org/pypi/ninja/1.13.2/json',
    sdkPython: '3.9.2', sdkNode: '20.18.0', host: 'Windows x64', toolHashes },
  build: { command: './scripts/build-solver.ps1', target: 'slvs-wasm', type: 'Release',
    EIGEN_MPL2_ONLY: true, GUI: false, CLI: false, OpenMP: false, LTO: true,
    initialMemoryBytes: 32 * 1024 * 1024, memoryGrowth: true, modularize: true, exportES6: true, singleFile: false,
    closure: false, exportedRuntimeMethods: ['HEAPU8'], environments: ['web', 'worker', 'node'],
    logs: ['docs/learning/evidence/T-003-configure.log', 'docs/learning/evidence/T-003-build.log',
      'docs/learning/evidence/T-003-ninja.log', 'docs/learning/evidence/T-003-configure-first-failure.log'] }, artifacts,
  validation: ['docs/learning/evidence/T-003-solver-node.json', 'docs/learning/evidence/T-003-solver-browser.json'],
  note: 'Hashes identify these actual outputs; byte-for-byte reproducibility across other hosts has not been claimed.' };
writeFileSync(path.join(root, 'docs/third-party/solver-build.json'), JSON.stringify(metadata, null, 2) + '\n');
writeFileSync(path.join(root, 'public/wasm/BUILD_SOURCE.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log('Recorded solver source, patches, tools, artifact hashes and original license texts.');
