import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const staged=process.argv.includes('--staged');
const solver=JSON.parse(readFileSync('docs/third-party/solver-build.json','utf8'));
const csg=JSON.parse(readFileSync('docs/third-party/csg-source.json','utf8'));
const checks=[];
for(const [name,item] of Object.entries(solver.artifacts)) checks.push({path:`public/wasm/${name}`,sha256:item.sha256});
for(const item of solver.licenses) checks.push({path:item.retained,sha256:item.sha256});
checks.push({path:csg.retained,sha256:csg.source.sha256});
for(const item of csg.extraLicenses)checks.push({path:item.retained,sha256:item.sha256});
for(const item of checks) {
  const bytes=readFileSync(item.path);assert.equal(hash(bytes),item.sha256,item.path);
  if(staged)assert.equal(hash(execFileSync('git',['show',`:${item.path}`],{maxBuffer:10*1024*1024})),item.sha256,`Git index byte mismatch: ${item.path}`);
}
writeFileSync('docs/learning/evidence/T-004-distribution.json',JSON.stringify({task:'T-004',executedAt:new Date().toISOString(),
  command:staged?'node scripts/check-distribution.mjs --staged':'node scripts/check-distribution.mjs',
  method:'SHA-256 compared against recorded native build / source blobs; optional Git index check prevents line-ending conversion.',
  checked:checks,gitIndexChecked:staged,passed:true},null,2)+'\n');
console.log(`PASS: ${checks.length} original artifact/license/source hashes${staged?' including Git index bytes':''}.`);
