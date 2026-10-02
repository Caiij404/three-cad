import type { SolidInput, TriangleMesh, Vec3 } from '../core/mesh-types.ts';
import type { SketchFeature } from '../core/model/document.ts';
import type { SketchSolver } from '../app/sketch-recompute.ts';
import { buildSketchRegions, selectSketchRegion } from '../core/geometry/sketch-regions.ts';
import { meshMetrics } from '../core/geometry/mesh-metrics.ts';
import { contourFixture } from './region-fixtures.ts';
import type { BasePlane } from '../core/geometry/plane.ts';
export function booleanBoxSketch(id: string, plane: BasePlane = 'XY', x = 0, y = 0): SketchFeature {
  return contourFixture(id, [{ kind: 'polygon', id: `${id}-outer`, points: [[x, y], [x + 20, y], [x + 20, y + 20], [x, y + 20]] }], plane);
}
const require = (condition: boolean, message: string) => { if (!condition) throw new Error(`MESH_BOOLEAN_FIXTURE: ${message}`); };
export async function runMeshBooleanFixtures(solve: SketchSolver, run: (input: SolidInput) => Promise<TriangleMesh>) {
  const cases: Array<{ id: string; operation: string; plane: string; expectedVolumeMm3: number; actual: ReturnType<typeof meshMetrics>; inputMetrics: ReturnType<typeof meshMetrics>[] }> = [];
  const invalid: Array<{ id: string; code: string; message: string }> = [];
  async function mesh(sketch: SketchFeature, depth = 20) {
    const result = await solve({ sketch }, 0); require(!!result.sketch, `native ${sketch.id} failed`);
    return run({ kind: 'sketch-extrusion', sketch: result.sketch!, region: selectSketchRegion(buildSketchRegions(result.sketch!)).definition, depth });
  }
  async function check(id: string, operation: 'union' | 'subtract' | 'intersect', a: TriangleMesh, b: TriangleMesh, expectedVolumeMm3: number, plane = 'XY', expectedBounds?: { min: Vec3; max: Vec3 }, curve = false) {
    const output = await run({ kind: 'mesh-boolean', operation, a, b }), actual = meshMetrics(output);
    if (!expectedVolumeMm3) require(output.positions.length === 0 && actual.bounds === null && actual.signedVolume === 0, `${id} empty`);
    else {
      require(actual.closed && actual.signedVolume > 0, `${id} closed/outward`);
      require(Math.abs(actual.signedVolume - expectedVolumeMm3) <= expectedVolumeMm3 * (curve ? 0.01 : 1e-4), `${id} volume`);
      if (expectedBounds) for (const key of ['min', 'max'] as const) for (let axis = 0; axis < 3; axis++) require(Math.abs(actual.bounds![key][axis]! - expectedBounds[key][axis]!) <= 4e-4, `${id} bounds`);
    }
    cases.push({ id, operation, plane, expectedVolumeMm3, actual, inputMetrics: [meshMetrics(a), meshMetrics(b)] });
  }
  for (const plane of ['XY', 'XZ', 'YZ'] as const) {
    const a = await mesh(booleanBoxSketch('a', plane)), b = await mesh(booleanBoxSketch('b', plane, 10));
    const bounds = (lo: number, hi: number) => plane === 'XY' ? { min: [lo, 0, 0] as Vec3, max: [hi, 20, 20] as Vec3 }
      : plane === 'XZ' ? { min: [lo, -20, 0] as Vec3, max: [hi, 0, 20] as Vec3 } : { min: [0, lo, 0] as Vec3, max: [20, hi, 20] as Vec3 };
    await check(`${plane}-union`, 'union', a, b, 12000, plane, bounds(0, 30));
    await check(`${plane}-A-B`, 'subtract', a, b, 4000, plane, bounds(0, 10));
    await check(`${plane}-B-A`, 'subtract', b, a, 4000, plane, bounds(20, 30));
    await check(`${plane}-intersect`, 'intersect', a, b, 4000, plane, bounds(10, 20));
  }
  const a = await mesh(booleanBoxSketch('a'));
  for (const [kind, x] of [['disjoint', 30], ['face-touch', 20], ['identical', 0]] as const) {
    const b = await mesh(booleanBoxSketch('b', 'XY', x));
    for (const operation of ['union', 'subtract', 'intersect'] as const) await check(`${kind}-${operation}`, operation, a, b,
      kind === 'identical' ? operation === 'subtract' ? 0 : 8000 : operation === 'union' ? 16000 : operation === 'subtract' ? 8000 : 0);
  }
  const outer = await mesh(contourFixture('outer', [{ kind: 'polygon', id: 'outer-loop', points: [[0, 0], [40, 0], [40, 30], [0, 30]] }]), 10);
  const rectTool = await mesh(contourFixture('tool', [{ kind: 'polygon', id: 'tool-loop', points: [[15, 10], [25, 10], [25, 20], [15, 20]] }]), 10);
  await check('rectangular-cut-through', 'subtract', outer, rectTool, 11000);
  const circleTool = await mesh(contourFixture('tool', [{ kind: 'circle', id: 'tool-circle', center: [20, 15], radius: 5 }]), 10);
  await check('circular-cut-through', 'subtract', outer, circleTool, 12000 - 250 * Math.PI, 'XY', undefined, true);
  const reverse: TriangleMesh = { positions: [] }; for (let i = 0; i < a.positions.length; i += 9) reverse.positions.push(...a.positions.slice(i, i + 3), ...a.positions.slice(i + 6, i + 9), ...a.positions.slice(i + 3, i + 6));
  const base = { kind: 'mesh-boolean', operation: 'union', a, b: a } as const;
  const inputs: Array<[string, SolidInput, string]> = [
    ['empty', { ...base, a: { positions: [] } }, 'BOOLEAN_EMPTY_OPERAND'],
    ['NaN', { ...base, a: { positions: [NaN, ...a.positions.slice(1)] } }, 'BOOLEAN_INVALID_OPERAND'],
    ['open', { ...base, a: { positions: a.positions.slice(9) } }, 'BOOLEAN_INVALID_OPERAND'],
    ['reversed', { ...base, a: reverse }, 'BOOLEAN_INVALID_OPERAND'],
    ['capacity', { ...base, a: { positions: Array(2001 * 9).fill(0) } }, 'CSG_CAPACITY'],
    ['unknown-operation', { ...base, operation: 'bad' } as unknown as SolidInput, 'BOOLEAN_OPERATION'],
    ...(['edge', 'vertex'] as const).map(kind => [kind, { ...base, b: { positions: a.positions.map((value, i) => value + (i % 3 < 2 || kind === 'vertex' ? 20 : 0)) } }, 'BOOLEAN_INVALID_RESULT'] as [string, SolidInput, string]),
  ];
  for (const [id, input, code] of inputs) {
    let caught = false;
    try { await run(input); } catch (cause) { const error = cause as Error & { code?: string }; require(error.code === code, `${id} code ${error.code}`); invalid.push({ id, code, message: error.message }); caught = true; }
    require(caught, `${id} must refuse`);
  }
  const recovery = await run({ ...base, operation: 'intersect' }); require(Math.abs(meshMetrics(recovery).signedVolume - 8000) < 1e-6, 'error recovery');
  return { cases, invalid, recoveredAfterErrors: true, tolerances: { volumeRelative: 1e-4, curveVolumeRelative: 0.01, boundsMm: 4e-4, weldMm: 1e-6 } };
}
