import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const names=['pinia','nostics','@vue/devtools-api','@vue/devtools-kit','@vue/devtools-shared','birpc','hookable','mitt','perfect-debounce'];
mkdirSync('public/ui',{recursive:true});
const packages=[];
for(const name of names){
  const entry=lock.packages[`node_modules/${name}`];if(!entry)continue;
  const manifest=JSON.parse(readFileSync(`node_modules/${name}/package.json`,'utf8'));assert.equal(manifest.version,entry.version);
  const original=['LICENSE','LICENSE.md','LICENSE.txt','license','license.md'].map(file=>`node_modules/${name}/${file}`).find(existsSync);
  assert(original,`Missing actual license file for ${name}`);
  const retained=`public/ui/${name.replaceAll('/','-').replace('@','')}-LICENSE.txt`;
  copyFileSync(original,retained);const bytes=readFileSync(retained);
  packages.push({name,version:manifest.version,license:manifest.license,source:entry.resolved,integrity:entry.integrity,original,retained,
    sha256:createHash('sha256').update(bytes).digest('hex')});
}
const record={task:'T-101',checkedAt:new Date().toISOString(),method:'Exact installed Pinia/inlined dependency/devtools package license bytes; dev-only declarations are retained too.',packages};
writeFileSync('docs/third-party/ui-dependencies.json',JSON.stringify(record,null,2)+'\n');
writeFileSync('public/ui/BUILD_SOURCE.json',JSON.stringify(record,null,2)+'\n');
console.log(`Recorded ${packages.length} installed UI/development dependency declarations.`);
