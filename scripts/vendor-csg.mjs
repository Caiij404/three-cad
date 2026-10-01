import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const commit = '8bd00fe919ad464500653ad98d8d9a4de2f59015';
const repo = `${root}/.research/three-csgmesh`;
assert.equal(execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), commit);
const bytes = execFileSync('git', ['-C', repo, 'show', `${commit}:csg-lib.js`]);
const destination = `${root}/src/adapters/solid/vendor`;
mkdirSync(destination, { recursive: true });
writeFileSync(`${destination}/csg-lib.js`, bytes);
const hash = createHash('sha256').update(bytes).digest('hex');
const licenses = `${root}/public/solid`;
mkdirSync(licenses, { recursive: true });
writeFileSync(`${licenses}/UPSTREAM-README.txt`, execFileSync('git', ['-C', repo, 'show', `${commit}:README.md`]));
writeFileSync(`${licenses}/three-LICENSE.txt`, readFileSync(`${root}/node_modules/three/LICENSE`));
const record = { task: 'T-004', checkedAt: new Date().toISOString(),
  source: { url: 'https://github.com/manthrax/THREE-CSGMesh', commit, path: 'csg-lib.js',
    license: 'MIT; original copyright/banner and upstream declaration preserved', sha256: hash, bytes: bytes.length },
  retained: 'src/adapters/solid/vendor/csg-lib.js', modifications: 'None; raw Git blob bytes preserved.',
  bridge: 'Own TypeScript bridge; legacy three-csg.js and csg-worker.js are not copied.',
  three: { version: '0.186.1', types: '0.186.0', license: 'MIT',
    source: 'package-lock.json exact npm tarball/integrity', retainedLicense: 'public/solid/three-LICENSE.txt' },
  extraLicenses: [
    {retained:'public/solid/CSG-MIT.txt',source:'https://github.com/evanw/csg.js/blob/a8512afbac3cf503195870f7ef11c0a32f36c6d4/LICENSE',
      sha256:createHash('sha256').update(readFileSync(`${licenses}/CSG-MIT.txt`)).digest('hex')},
    {retained:'public/solid/earcut-LICENSE.txt',source:'Official npm earcut@3.0.2 package/LICENSE; Three.js source identifies vendored Earcut 3.0.2',
      sha256:createHash('sha256').update(readFileSync(`${licenses}/earcut-LICENSE.txt`)).digest('hex')},
  ] };
writeFileSync(`${root}/docs/third-party/csg-source.json`, JSON.stringify(record, null, 2) + '\n');
writeFileSync(`${licenses}/BUILD_SOURCE.json`, JSON.stringify(record, null, 2) + '\n');
console.log(`Vendored unchanged fixed CSG core: ${bytes.length} bytes, SHA256 ${hash}`);
