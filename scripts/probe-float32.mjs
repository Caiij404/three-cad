import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tolerance = 1e-5;
const inputs = [40, 40.123456789, 9999.0001, 9999.123456789];
const samples = inputs.map(input => {
  const actual = new Float32Array([input])[0];
  const error = Math.abs(actual - input);
  return { inputMm: input, actualMm: actual, absoluteErrorMm: error, toleranceMm: tolerance, withinTolerance: error <= tolerance };
});

assert(samples.every(sample => Number.isFinite(sample.actualMm)));
assert.equal(samples[0].absoluteErrorMm, 0, 'Integer control should be exactly representable');
assert(samples[2].absoluteErrorMm > tolerance, 'Expected a measurable precision loss at a supported coordinate');
assert(samples[3].absoluteErrorMm > tolerance, 'Expected a second precision loss beyond required residual tolerance');

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/learning/evidence/L-001A-float32.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  environment: { node: process.version, platform: process.platform },
  scope: 'JS Float32 conversion only; not a SolveSpace or WASM solve test',
  expected: 'At least one supported coordinate loses more than 1e-5 mm when converted to Float32',
  samples,
}, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(samples, null, 2)}\nPASS: precision-loss hypothesis reproduced; no solver executed.\n`);
