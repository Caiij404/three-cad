import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = path.join(root, '.research/typecheck-probe');
mkdirSync(path.join(fixture, 'src'), { recursive: true });
writeFileSync(path.join(fixture, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n');
writeFileSync(path.join(fixture, 'src/main.ts'), "import { createApp } from 'vue';\nimport App from './App.vue';\ncreateApp(App).mount('#app');\n");
writeFileSync(path.join(fixture, 'src/App.vue'), `<script setup lang="ts">
import { ref } from 'vue';
const count = ref<number>('not-a-number');
</script>
<template><output>{{ count }}</output></template>
`);
writeFileSync(path.join(fixture, 'tsconfig.json'), JSON.stringify({
  extends: '../../tsconfig.json', include: ['src/**/*.ts', 'src/**/*.vue'],
}, null, 2) + '\n');

function run(bin, args) {
  const result = spawnSync(process.execPath, [path.join(root, bin), ...args], {
    cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
  if (result.error) throw result.error;
  return { command: `node ${bin} ${args.join(' ')}`, exitCode: result.status,
    stdout: result.stdout, stderr: result.stderr };
}

const typecheck = run('node_modules/vue-tsc/bin/vue-tsc.js', [
  '--noEmit', '-p', '.research/typecheck-probe/tsconfig.json',
]);
const build = run('node_modules/vite/bin/vite.js', [
  'build', '.research/typecheck-probe', '--config', 'vite.config.ts',
]);
assert.notEqual(typecheck.exitCode, 0, 'The invalid SFC must fail type checking');
assert.match(typecheck.stdout + typecheck.stderr, /TS2345/, 'Expected the string-to-number diagnostic');
assert.equal(build.exitCode, 0, 'Vite alone transpiles this invalid type annotation');

const versions = Object.fromEntries(['vue', 'vite', 'vue-tsc', 'typescript'].map(name => [
  name, JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version,
]));
const evidence = { task: 'T-002', learningUnit: 'L-001B', executedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, versions },
  input: "const count = ref<number>('not-a-number');",
  expected: { typecheck: 'nonzero, TS2345', viteBuild: 'zero' },
  actual: { typecheck, viteBuild: build }, passed: true,
  limitation: 'Isolated tooling fixture; no CAD geometry or user mastery verified.' };
const output = path.join(root, 'docs/learning/evidence/L-001B-typecheck.json');
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(`PASS: vue-tsc rejected TS2345 (exit ${typecheck.exitCode}); Vite built the same SFC (exit ${build.exitCode}).`);
console.log('Evidence: docs/learning/evidence/L-001B-typecheck.json');
