import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
function sources(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sources(`${directory}/${entry.name}`):entry.name.endsWith('.ts')?[`${directory}/${entry.name}`]:[]);}
const files=sources('src/core');
for(const file of files){const text=readFileSync(file,'utf8');assert(!/from\s+['"](?:vue|pinia|three)(?:\/|['"])/.test(text),`Forbidden core import: ${file}`);
  assert(!/\b(?:window|HTMLElement|WebGLRenderer|Worker)\b/.test(text),`Runtime type leaked into core: ${file}`);}
const result=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/document-schema.test.mjs','tests/project-engine.test.mjs'],{encoding:'utf8'});
const output=(result.stdout||'')+(result.stderr||'');writeFileSync('docs/learning/evidence/T-102-domain.log',output);
const tests=Number(output.match(/# tests (\d+)/)?.[1]),passed=Number(output.match(/# pass (\d+)/)?.[1]);
writeFileSync('docs/learning/evidence/T-102-domain.json',JSON.stringify({task:'T-102',executedAt:new Date().toISOString(),command:'npm run check:domain',
  environment:{node:process.version,platform:process.platform,arch:process.arch},tests,passedTests:passed,exitCode:result.status,
  coreFilesChecked:files,method:'Node test assertions use unknown JSON/ref/DAG fixtures, candidate transactions, real CSG cache, delayed promises and snapshot history.',
  passed:result.status===0&&tests===passed},null,2)+'\n');
if(result.status!==0){process.stderr.write(output);process.exitCode=result.status??1;}else console.log(`PASS: ${passed}/${tests} domain tests; ${files.length} core files have no Vue/Pinia/Three/runtime imports.`);
