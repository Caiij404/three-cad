import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
const bytes=path=>readFileSync(path),read=path=>bytes(path).toString('utf8'),json=path=>JSON.parse(read(path));
const sha=path=>createHash('sha256').update(bytes(path)).digest('hex');
const prd=read('docs/PRD.md'),acceptance=read('docs/ACCEPTANCE.md'),records=new Map(),checks=[];
const expected=[...new Set([...prd.matchAll(/^- (AC-\d{3}-\d+)：/gm)].map(m=>m[1]))].sort();
const rows=[...acceptance.matchAll(/^\| (AC-\d{3}-\d+) \| (.*?) \| (.*?) \| 通过 \|$/gm)];
assert.equal(expected.length,52,'The approved P0 set has changed: review the delivery gate.');
assert.deepEqual(rows.map(r=>r[1]).sort(),expected,'Every P0 must have exactly one passing evidence row.');
function evidence(path){
  if(records.has(path))return records.get(path);
  const data=json(path);
  if(path.endsWith('T-403C2b2-performance-transfer.json'))assert(data.results?.length===3&&data.results.every(r=>Object.values(r.budgets).every(Boolean)&&r.resources.passed&&r.csg.passed),`Performance categories are not passing: ${path}`);
  else assert.equal(data.passed,true,`Evidence is not passing: ${path}`);
  const record={path,sha256:sha(path),executedAt:data.executedAt??data.checkedAt,task:data.task};records.set(path,record);return record;
}
const ac=rows.map(([,id,result,links])=>{
  const paths=[...links.matchAll(/\]\((learning\/evidence\/[^)]+\.json)\)/g)].map(m=>resolve('docs',m[1]));
  assert(paths.length,`No numeric/real-browser evidence attached to ${id}`);
  return{id,result,evidence:paths.map(path=>evidence(path.replaceAll('\\','/').replace(process.cwd().replaceAll('\\','/')+'/','')))};
});
const versions={chrome:'154.0.8037.92',edge:'154.0.4258.53',firefox:'157.0'};
const e2eFiles=['current-browsers','e2e-geometry','e2e-failures'].map(name=>`docs/learning/evidence/T-403C2b2-${name}.json`);
for(const path of e2eFiles){
  const data=json(path);evidence(path);assert.equal(data.results.length,6);
  const seen=new Set();for(const r of data.results){assert.equal(r.passed,true);assert.equal(r.version,versions[r.kind]);assert(['production-root','production-/cad/'].includes(r.mode));seen.add(`${r.kind}:${r.mode}`);}
  assert.equal(seen.size,6);checks.push({check:'final-three-browser-root-cad',path,passed:true});
}
for(const [suffix,base] of [['root','/'],['cad','/cad/']]){
  const path=`docs/learning/evidence/T-403C2b2-nfr-${suffix}.json`,data=json(path);evidence(path);assert.equal(data.results.length,3);
  assert.equal(new Set(data.results.map(r=>r.kind)).size,3);
  for(const r of data.results){
    assert.equal(r.version,versions[r.kind]);assert.equal(r.base,base);assert.equal(r.passed,true);
    assert.equal(r.allRuntimeResourcesSameOrigin,true);assert.equal(r.invalidInputPreservedDocument,true);assert.equal(r.prompt.type,'beforeunload');assert.equal(r.prompt.cancelPreservedExactDocument,true);
    assert.equal(r.focus.focusVisible,true);assert(Number.parseFloat(r.focus.outlineWidth)>=2);assert(r.errorText.length);
    assert.equal(r.stages.length,7);assert(r.stages.every(s=>s.controls.every(c=>c.label?.trim())));
    // The final root browser fetched the same hashed bundles emitted by this fresh build.
    if(base==='/')for(const url of r.resources){const p=new URL(url).pathname;if(p.startsWith('/assets/'))assert(existsSync(`dist/assets/${basename(p)}`),`Build differs from final browser evidence: ${p}`);}
  }
  checks.push({check:'native-focus-labels-error-unload-same-origin',path,passed:true});
}
const perfPath='docs/learning/evidence/T-403C2b2-performance-transfer.json',perf=json(perfPath);
assert.equal(perf.results.length,3);assert.equal(new Set(perf.results.map(r=>r.kind)).size,3);
for(const r of perf.results){
  assert.equal(r.version,versions[r.kind]);assert.deepEqual([r.input.lines,r.input.constraints,r.input.solids],[100,100,10]);assert(r.input.actualTriangles>=100000);
  assert(r.samples>=30&&r.warmupExcluded);assert(r.solverP95Ms<=200&&r.maxMainThreadGapMs<=200&&r.orbit.medianFps>=30&&r.orbit.renderedFrameCount>=30);
  assert(Object.values(r.budgets).every(Boolean));assert(r.coldMaxGapMs<=200&&r.resources.maxOpenTimerGapMs<=200);assert.equal(r.resources.cycles.length,20);assert.equal(r.resources.tenActualWebglRemounts,true);assert.equal(r.resources.passed,true);
  assert.equal(r.csg.eachOperationWarmSamples,30);assert.equal(r.csg.samples.length,90);assert.equal(r.csg.passed,true);assert.equal(r.csg.exactUndoNoKernelCalls,true);
  assert.deepEqual([r.csg.input.lines,r.csg.input.constraints,r.csg.input.solids],[100,100,10]);
  assert(r.csg.input.actualTriangles>=100000&&Object.values(r.csg.p95ByOperation).every(n=>n<=2000));
  for(const operation of ['union','subtract','intersect'])assert.equal(r.csg.samples.filter(s=>s.operation===operation).length,30);
  for(const s of r.csg.samples){assert(s.maxTimerGapMs<=200&&s.minActualTrianglesDrawn>=100000&&s.closed&&s.float64Wire);assert.equal(s.outputBytes,s.triangles*72);assert.deepEqual(s.inputBytesAfter,[0,0]);assert(s.inputBytesBefore.every(n=>n>0));}
}
checks.push({check:'performance-transfer-resources',path:perfPath,sha256:sha(perfPath),passed:true});
const lock=json('package-lock.json'),manifest=json('package.json'),npm=json('docs/third-party/npm-dependencies.json');
assert.equal(process.version,`v${manifest.engines.node}`);assert.equal(npm.task,'T-404');assert.equal(npm.lockfileSha256,sha('package-lock.json'));
for(const [name,version] of Object.entries({...manifest.dependencies,...manifest.devDependencies})){assert.equal(lock.packages[`node_modules/${name}`].version,version);assert.equal(json(`node_modules/${name}/package.json`).version,version);}
assert(!Object.keys(lock.packages).some(p=>/node_modules\/(react|react-dom|redux|react-redux)$/.test(p)));
for(const source of ['solver-build','csg-source','ui-dependencies'])assert(existsSync(`docs/third-party/${source}.json`));
const distribution=json('docs/learning/evidence/T-404-distribution.json');evidence('docs/learning/evidence/T-404-distribution.json');assert.equal(distribution.gitIndexChecked,true);
for(const item of distribution.checked){assert.equal(sha(item.path),item.sha256);if(item.path.startsWith('public/'))assert.equal(sha(item.path.replace(/^public\//,'dist/')),item.sha256);}
assert.equal(read('dist/THIRD_PARTY_NOTICES.txt'),read('public/THIRD_PARTY_NOTICES.txt'));
checks.push({check:'locked-installed-dependencies-and-distributed-original-bytes',lockedPackages:npm.packages.length,installedPackages:npm.packages.filter(p=>p.installed).length,lockSha256:sha('package-lock.json'),originalFiles:distribution.checked.length,passed:true});
const cliPath='docs/learning/evidence/T-404-cli.json',cli=json(cliPath);evidence(cliPath);assert.equal(cli.environment.node,process.version);assert.equal(cli.results.length,2);
for(const r of cli.results){assert.equal(r.passed,true);assert.deepEqual([r.documentStatus,r.entryStatus,r.wasmStatus],[200,200,200]);assert.equal(r.wasmMime,'application/wasm');}
checks.push({check:'actual-development-and-cad-cli-http-mime',path:cliPath,passed:true});
const nfr=[...new Set([...read('docs/VERIFICATION.md').matchAll(/^\| (NFR-\d{3}) \|/gm)].map(m=>m[1]))].sort();assert.deepEqual(nfr,Array.from({length:7},(_,i)=>`NFR-${String(i+1).padStart(3,'0')}`));
writeFileSync('docs/learning/evidence/T-404-delivery-audit.json',JSON.stringify({task:'T-404',executedAt:new Date().toISOString(),command:'npm run check:delivery',baselineCommit:'7cc1879',environment:{node:process.version,platform:process.platform,arch:process.arch},method:'Read exact PRD P0 IDs, manual acceptance mapping, prior executed artifacts, fresh lock/install and build bytes. This audit does not rerun geometry or UI experiments.',acceptance:ac,nfr,checks,evidence:[...records.values()],passed:true,limitations:['Evidence provenance and declared results are audited; actual geometry assertions are in the referenced executed scripts.','Fixed browser versions are the verified stable matrix as of 2026-10-03; future releases require new acceptance.','Learning mastery and arbitrary-geometry reliability are not inferred.']},null,2)+'\n');
console.log(`PASS: ${ac.length} P0 ACs / ${nfr.length} NFRs; final three-browser root/cad artifacts, actual performance/transfer/resources and ${distribution.checked.length} source/distribution hashes audited.`);
