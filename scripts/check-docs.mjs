import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, '..');
const ignored = new Set(['.git', '.research', 'node_modules', 'dist', 'coverage']);
const issues = [];

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

const files = await collect(projectRoot);
let links = 0;
for (const path of files) {
  const name = relative(projectRoot, path).split(sep).join('/');
  const learning = name.startsWith('docs/learning/');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
  } catch (error) {
    issues.push(`${name}: invalid UTF-8 (${error.message})`);
    continue;
  }
  let fence;
  let lastHeading = 0;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const location = `${name}:${index + 1}`;
    if (/[ \t]+$/.test(line)) issues.push(`${location}: trailing whitespace`);
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) {
        fence = { char: marker[1][0], length: marker[1].length };
        if (learning && !marker[2].trim()) issues.push(`${location}: missing code language`);
      } else if (marker[1][0] === fence.char && marker[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const heading = /^(#{1,6})\s+/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (level > lastHeading + 1) issues.push(`${location}: heading level skipped`);
      if (learning && level > 3) issues.push(`${location}: learning heading deeper than level 3`);
      lastHeading = level;
    }
    if (learning && /^\|/.test(line)) {
      const columns = line.split('|').length - 2;
      if (columns > 4) issues.push(`${location}: learning table has ${columns} columns`);
    }
    for (const match of line.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].trim().replace(/^<|>$/g, '');
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
      links += 1;
      const localPath = decodeURIComponent(target.split('#')[0]);
      if (!localPath) continue;
      const absolute = resolve(dirname(path), localPath);
      if (!absolute.startsWith(`${projectRoot}${sep}`)) {
        issues.push(`${location}: link leaves project (${target})`);
        continue;
      }
      try {
        if (!(await stat(absolute)).isFile()) issues.push(`${location}: target is not a file (${target})`);
      } catch {
        issues.push(`${location}: missing link target (${target})`);
      }
    }
  }
  if (fence) issues.push(`${name}: unclosed code fence`);
}

if (issues.length) {
  process.stderr.write(`${issues.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS: ${files.length} Markdown files, ${links} local links; UTF-8, headings, fences, whitespace and learning tables checked.\n`);
}
