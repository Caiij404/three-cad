import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = JSON.parse(await readFile(resolve(root, 'docs/third-party/sources.json'), 'utf8'));
const output = resolve(root, 'docs/learning/evidence/T-001-source-audit.json');
const checkOnly = process.argv.includes('--check');

function git(repository, ...args) {
  return execFileSync('git', ['-C', resolve(root, '.research', repository), ...args], {
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}

const report = {
  schemaVersion: 1,
  auditedAt: sources.auditedAt,
  environment: { platform: process.platform, node: process.version, git: execFileSync('git', ['--version']).toString().trim() },
  repositories: [],
};

for (const source of sources.repositories) {
  const actualCommit = git(source.id, 'rev-parse', 'HEAD').toString().trim();
  assert.equal(actualCommit, source.commit, `${source.id}: checkout must match pinned commit`);
  const files = [];
  for (const path of source.files) {
    const data = git(source.id, 'show', `${source.commit}:${path}`);
    const blob = git(source.id, 'rev-parse', `${source.commit}:${path}`).toString().trim();
    const file = { path, blob, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    if (path.endsWith('.wasm')) {
      // Compilation validates the binary format; it does not instantiate or run the solver.
      const module = new WebAssembly.Module(data);
      file.formatValid = true;
      file.exports = WebAssembly.Module.exports(module);
      file.imports = WebAssembly.Module.imports(module);
    }
    files.push(file);
  }
  const submodules = [];
  for (const item of source.submodules ?? []) {
    const entry = git(source.id, 'ls-tree', source.commit, item.path).toString().trim();
    assert.equal(entry.split(/\s+/)[2], item.commit, `${source.id}: ${item.path} commit mismatch`);
    submodules.push({ path: item.path, commit: item.commit });
  }
  report.repositories.push({ id: source.id, commit: source.commit, files, submodules });
}

const json = `${JSON.stringify(report, null, 2)}\n`;
if (checkOnly) {
  const previous = JSON.parse(await readFile(output, 'utf8'));
  // The bytes and commits are invariant; another machine may use a different Git/Node.
  assert.deepEqual(report.repositories, previous.repositories, 'Source content changed from recorded evidence');
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, json, 'utf8');
}
const count = report.repositories.reduce((total, repo) => total + repo.files.length, 0);
process.stdout.write(`PASS: ${report.repositories.length} pinned repositories, ${count} files; byte hashes and submodule pins verified. Solver execution NOT performed.\n`);
