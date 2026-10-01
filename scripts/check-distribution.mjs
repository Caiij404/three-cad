import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const staged=process.argv.includes('--staged');
const task=process.argv.find(arg=>arg.startsWith('--task='))?.slice(7) ?? 'T-004';
assert(/^T-\d{3}$/.test(task));
const solver=JSON.parse(readFileSync('docs/third-party/solver-build.json','utf8'));
const csg=JSON.parse(readFileSync('docs/third-party/csg-source.json','utf8'));
const checks=[];
for(const [name,item] of Object.entries(solver.artifacts)) checks.push({path:`public/wasm/${name}`,sha256:item.sha256});
for(const item of solver.licenses) checks.push({path:item.retained,sha256:item.sha256});
checks.push({path:csg.retained,sha256:csg.source.sha256});
for(const item of csg.extraLicenses)checks.push({path:item.retained,sha256:item.sha256});
if(existsSync('docs/third-party/ui-dependencies.json')) {
  const ui=JSON.parse(readFileSync('docs/third-party/ui-dependencies.json','utf8'));
  for(const item of ui.packages)checks.push({path:item.retained,sha256:item.sha256});
}
for(const item of checks) {
  const bytes=readFileSync(item.path);assert.equal(hash(bytes),item.sha256,item.path);
  if(staged)assert.equal(hash(execFileSync('git',['show',`:${item.path}`],{maxBuffer:10*1024*1024})),item.sha256,`Git index byte mismatch: ${item.path}`);
}
writeFileSync(`docs/learning/evidence/${task}-distribution.json`,JSON.stringify({task,executedAt:new Date().toISOString(),
  command:`node scripts/check-distribution.mjs${staged?' --staged':''} --task=${task}`,
  method:'SHA-256 compared against recorded native build / source blobs; optional Git index check prevents line-ending conversion.',
  checked:checks,gitIndexChecked:staged,passed:true},null,2)+'\n');
console.log(`PASS: ${checks.length} original artifact/license/source hashes${staged?' including Git index bytes':''}.`);
